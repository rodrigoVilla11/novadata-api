import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CashService } from 'src/cash/cash.service';
import {
  CashMovementType,
  PaymentMethod,
} from 'src/cash/schemas/cash-movement.schema';

import { Order } from 'src/orders/schemas/order.schema';

import { Sale, SaleStatus } from './schemas/sale.schema';

// Si ya tenés StockService, lo inyectamos.
// Ajustá el import al path real de tu módulo de stock.
import { StockService } from 'src/stock/stock.service';

function pickUserId(u: any) {
  return u?.id ?? u?._id ?? u?.userId ?? null;
}

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(v: any) {
  const n = num(v);
  return n < 0 ? 0 : n;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<Sale>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly cashService: CashService,
    private readonly stockService: StockService,
  ) {}

  // ============================
  // Create from order
  // ============================

  async createFromOrder(user: any, orderId: string) {
    if (!orderId) throw new BadRequestException('orderId is required');

    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new NotFoundException('Order not found');

    // Permitimos crear sale si el order fue ACCEPTED (ideal),
    // o si lo estás usando en POS como “directo”.
    if (!(order as any).items?.length) {
      throw new BadRequestException('Order has no items');
    }

    // evitar duplicado sale por orderId
    const existing = await this.saleModel.findOne({
      orderId: new Types.ObjectId(orderId),
    });
    if (existing)
      throw new ConflictException('Sale already exists for this order');

    const items = (order as any).items.map((it: any) => ({
      productId: new Types.ObjectId(String(it.productId)),
      qty: num(it.qty),
      unitPrice: money(it.unitPrice),
      lineTotal: money(it.lineTotal),
      note: it.note ?? null,
    }));

    const subtotal = items.reduce(
      (acc: number, x: any) => acc + money(x.lineTotal),
      0,
    );
    const total = subtotal;

    const sale = await this.saleModel.create({
      status: SaleStatus.DRAFT,
      source: (order as any).source === 'ONLINE' ? 'ONLINE' : 'POS',
      orderId: new Types.ObjectId(orderId),
      customerId: (order as any).customerId
        ? new Types.ObjectId(String((order as any).customerId))
        : null,
      items,
      subtotal,
      total,
      payments: [],
      paidTotal: 0,
      paidAt: null,
      note: (order as any).note ?? null,
      voided: false,
      createdByUserId: pickUserId(user),
    });

    return this.toDto(sale);
  }

  // ============================
  // Read
  // ============================

  async findAll(params?: {
    status?: SaleStatus;
    from?: string; // ISO
    to?: string; // ISO
    limit?: number;
  }) {
    const filter: any = {};

    if (params?.status) filter.status = params.status;

    if (params?.from || params?.to) {
      filter.createdAt = {};
      if (params.from) filter.createdAt.$gte = new Date(params.from);
      if (params.to) filter.createdAt.$lte = new Date(params.to);
    }

    const limit = Math.min(200, Math.max(1, Number(params?.limit ?? 50)));

    const rows = await this.saleModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows.map((x: any) => this.toDto(x));
  }

  async findByOrderId(orderId: string) {
    if (!orderId) throw new BadRequestException('orderId is required');
    const doc = await this.saleModel
      .findOne({ orderId: new Types.ObjectId(orderId) })
      .lean();
    return doc ? this.toDto(doc) : null;
  }

  async findOne(id: string) {
    const doc = await this.saleModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Sale not found');
    return this.toDto(doc);
  }

  // ============================
  // Pay (generates cash movements + stock movements)
  // ============================

  /**
   * Cobra una venta.
   * - Crea movimientos INCOME en Cash (uno por payment method).
   * - Descuenta stock automáticamente (usando tu StockService).
   *
   * Requiere dateKey (YYYY-MM-DD) para imputar en caja del día.
   */
  async pay(
    user: any,
    saleId: string,
    dto: {
      dateKey: string;
      payments: Array<{
        method: PaymentMethod;
        amount: number;
        note?: string | null;
      }>;
      concept?: string; // texto del movimiento
      note?: string | null; // nota general de la venta
      categoryId?: string | null; // si querés categorizar en finance
    },
  ) {
    if (!saleId) throw new BadRequestException('saleId is required');
    if (!dto?.dateKey) throw new BadRequestException('dateKey is required');
    if (!Array.isArray(dto.payments) || dto.payments.length === 0) {
      throw new BadRequestException('payments[] is required');
    }

    const sale = await this.saleModel.findById(saleId);
    if (!sale) throw new NotFoundException('Sale not found');

    if (sale.status === SaleStatus.PAID) {
      throw new BadRequestException('Sale is already PAID');
    }
    if (sale.status === SaleStatus.VOIDED || sale.voided) {
      throw new BadRequestException('Sale is VOIDED');
    }
    if (!sale.items?.length) throw new BadRequestException('Sale has no items');

    const total = money(sale.total);

    // normalizar payments
    const payments = dto.payments
      .map((p) => ({
        method: p.method,
        amount: money(p.amount),
        note: p.note ? String(p.note).trim() : null,
      }))
      .filter((p) => p.amount > 0);

    if (!payments.length)
      throw new BadRequestException('payments total must be > 0');

    const paidTotal = payments.reduce((acc, p) => acc + money(p.amount), 0);

    // En POS normalmente querés que pague exacto
    // Si querés permitir "vuelto" a futuro, lo hacemos.
    if (Math.abs(paidTotal - total) > 0.000001) {
      throw new BadRequestException(
        `Paid total (${paidTotal}) must equal sale total (${total})`,
      );
    }

    // 1) Caja del día (branchId undefined)
    const day = await this.cashService.getOrCreateDay(
      user,
      dto.dateKey,
      undefined,
    );

    // 2) Movimientos de caja (uno por método)
    const conceptBase = (dto.concept ?? 'VENTA').trim() || 'VENTA';
    const saleLabel = `Sale ${String(sale._id)}`;

    for (const p of payments) {
      await this.cashService.createMovement(user, {
        cashDayId: day.id,
        type: CashMovementType.INCOME,
        method: p.method,
        amount: p.amount,
        categoryId: dto.categoryId ?? null,
        concept: conceptBase,
        note: `${saleLabel}${p.note ? ` - ${p.note}` : ''}`,

        refType: 'SALE',
        refId: String(sale._id),
      } as any);
    }

    // 3) Stock (descuento por receta/producto)
    //    Ajustá el método si tu StockService tiene otro nombre.
    //    La idea: por cada item vendido, aplicar movimiento OUT.
    await this.stockService.applySale({
      dateKey: dto.dateKey,
      saleId: String(sale._id),
      lines: sale.items.map((it: any) => ({
        productId: String(it.productId),
        qty: num(it.qty),
      })),
      note: dto.note ?? null,
      userId: user?.id ?? user?._id ?? null,
    });

    // 4) Marcar venta como pagada
    sale.status = SaleStatus.PAID;
    sale.payments = payments as any;
    sale.paidTotal = paidTotal;
    sale.paidAt = new Date();
    sale.paidByUserId = pickUserId(user);
    sale.note = dto.note ? String(dto.note).trim() : (sale.note ?? null);
    sale.paidDateKey = dto.dateKey;

    await sale.save();

    return this.toDto(sale);
  }

  // ============================
  // Void
  // ============================

  async voidSale(
    user: any,
    saleId: string,
    reason?: string | null,
    overrideDateKey?: string | null, // opcional si querés forzar
  ) {
    const sale = await this.saleModel.findById(saleId);
    if (!sale) throw new NotFoundException('Sale not found');

    if (sale.status === SaleStatus.VOIDED || sale.voided) {
      return this.toDto(sale);
    }

    // Si estaba PAID => reversa contable
    if (sale.status === SaleStatus.PAID) {
      const dateKey = overrideDateKey ?? sale.paidDateKey;
      if (!dateKey) {
        throw new BadRequestException(
          'paidDateKey missing: provide overrideDateKey',
        );
      }

      // 1) caja del mismo día
      const day = await this.cashService.getOrCreateDay(
        user,
        dateKey,
        undefined,
      );

      // 2) reversa de caja: EXPENSE por cada pago (mismo método/monto)
      const concept = 'REVERSION VENTA';
      const saleLabel = `Void Sale ${String(sale._id)}`;

      for (const p of sale.payments ?? []) {
        await this.cashService.createMovement(user, {
          cashDayId: day.id,
          type: CashMovementType.EXPENSE,
          method: p.method,
          amount: money(p.amount),
          categoryId: null,
          concept,
          note: `${saleLabel}${p.note ? ` - ${p.note}` : ''}`,

          refType: 'SALE_VOID',
          refId: String(sale._id),
        } as any);
      }

      // 3) stock: reponer ingredientes (IN)
      await this.stockService.applySaleReversal({
        dateKey,
        saleId: String(sale._id),
        lines: (sale.items ?? []).map((it: any) => ({
          productId: String(it.productId),
          qty: num(it.qty),
        })),
        note: reason ?? null,
        userId: pickUserId(user),
      });
    }

    // 4) marcar VOIDED
    sale.status = SaleStatus.VOIDED;
    sale.voided = true;
    sale.voidedAt = new Date();
    sale.voidReason = reason ? String(reason).trim() : null;

    await sale.save();
    return this.toDto(sale);
  }

  // ============================
  // DTO
  // ============================

  private toDto(doc: any) {
    return {
      id: String(doc._id ?? doc.id),
      status: doc.status,
      source: doc.source,

      orderId: doc.orderId ? String(doc.orderId) : null,
      customerId: doc.customerId ? String(doc.customerId) : null,

      subtotal: num(doc.subtotal),
      total: num(doc.total),

      items: (doc.items ?? []).map((it: any) => ({
        productId: it.productId ? String(it.productId) : null,
        qty: num(it.qty),
        unitPrice: num(it.unitPrice),
        lineTotal: num(it.lineTotal),
        note: it.note ?? null,
      })),

      payments: (doc.payments ?? []).map((p: any) => ({
        method: p.method,
        amount: num(p.amount),
        note: p.note ?? null,
      })),

      paidTotal: num(doc.paidTotal),
      paidAt: doc.paidAt ?? null,

      note: doc.note ?? null,

      voided: !!doc.voided,
      voidedAt: doc.voidedAt ?? null,
      voidReason: doc.voidReason ?? null,

      createdByUserId: doc.createdByUserId ?? null,
      paidByUserId: doc.paidByUserId ?? null,

      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
