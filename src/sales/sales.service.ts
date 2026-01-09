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

  private oidOrThrow(id: string, label: string) {
    const s = String(id ?? '').trim();
    if (!s) throw new BadRequestException(`${label} is required`);
    if (!Types.ObjectId.isValid(s))
      throw new BadRequestException(`${label} must be a valid ObjectId`);
    return new Types.ObjectId(s);
  }

  // ============================
  // Create from order
  // ============================

  async createFromOrder(user: any, branchId: string, orderId: string) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    if (!orderId) throw new BadRequestException('orderId is required');

    const orderObjId = this.oidOrThrow(orderId, 'orderId');
    const order = await this.orderModel.findById(orderObjId).lean();
    if (!order) throw new NotFoundException('Order not found');

    if (!(order as any).items?.length) {
      throw new BadRequestException('Order has no items');
    }

    // ✅ evitar duplicado sale por (branchId, orderId)
    const existing = await this.saleModel.findOne({
      branchId: branchObjId,
      orderId: orderObjId,
    });
    if (existing)
      throw new ConflictException('Sale already exists for this order');

    const items = (order as any).items.map((it: any) => ({
      productId: this.oidOrThrow(String(it.productId), 'productId'),
      qty: num(it.qty),
      unitPrice: money(it.unitPrice),
      lineTotal: money(it.lineTotal),
      note: it.note ?? null,
    }));

    const subtotal = items.reduce((acc: number, x: any) => acc + money(x.lineTotal), 0);
    const total = subtotal;

    const sale = await this.saleModel.create({
      branchId: branchObjId,
      status: SaleStatus.DRAFT,
      source: (order as any).source === 'ONLINE' ? 'ONLINE' : 'POS',
      orderId: orderObjId,
      customerId: (order as any).customerId
        ? this.oidOrThrow(String((order as any).customerId), 'customerId')
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

  async findAll(branchId: string, params?: {
    status?: SaleStatus;
    from?: string; // ISO
    to?: string; // ISO
    limit?: number;
  }) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');

    const filter: any = { branchId: branchObjId };

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

  async findByOrderId(branchId: string, orderId: string) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    const doc = await this.saleModel
      .findOne({ branchId: branchObjId, orderId: orderObjId })
      .lean();

    return doc ? this.toDto(doc) : null;
  }

  async findOne(branchId: string, id: string) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const saleObjId = this.oidOrThrow(id, 'saleId');

    const doc = await this.saleModel
      .findOne({ _id: saleObjId, branchId: branchObjId })
      .lean();

    if (!doc) throw new NotFoundException('Sale not found');
    return this.toDto(doc);
  }

  // ============================
  // Pay (cash + stock)
  // ============================

  /**
   * Cobra una venta.
   * - Crea movimientos INCOME en Cash
   * - Descuenta stock (StockService)
   *
   * Requiere dateKey (YYYY-MM-DD) para imputar en caja del día.
   */
  async pay(
    user: any,
    branchId: string,
    saleId: string,
    dto: {
      dateKey: string;
      payments: Array<{
        method: PaymentMethod;
        amount: number;
        note?: string | null;
      }>;
      concept?: string;
      note?: string | null;
      categoryId?: string | null;
    },
  ) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const saleObjId = this.oidOrThrow(saleId, 'saleId');

    if (!dto?.dateKey) throw new BadRequestException('dateKey is required');
    if (!Array.isArray(dto.payments) || dto.payments.length === 0) {
      throw new BadRequestException('payments[] is required');
    }

    // 0) leer venta (con branch)
    const sale0 = await this.saleModel.findOne({ _id: saleObjId, branchId: branchObjId }).lean();
    if (!sale0) throw new NotFoundException('Sale not found');

    if (sale0.status === SaleStatus.VOIDED || (sale0 as any).voided) {
      throw new BadRequestException('Sale is VOIDED');
    }
    if (!(sale0 as any).items?.length) throw new BadRequestException('Sale has no items');

    const total = money((sale0 as any).total);

    const payments = dto.payments
      .map((p) => ({
        method: p.method,
        amount: money(p.amount),
        note: p.note ? String(p.note).trim() : null,
      }))
      .filter((p) => p.amount > 0);

    if (!payments.length) throw new BadRequestException('payments total must be > 0');

    const paidTotal = payments.reduce((acc, p) => acc + money(p.amount), 0);

    if (Math.abs(paidTotal - total) > 0.000001) {
      throw new BadRequestException(
        `Paid total (${paidTotal}) must equal sale total (${total})`,
      );
    }

    // 1) idempotencia: si ya está PAID, devolvemos
    if (sale0.status === SaleStatus.PAID) {
      const already = await this.saleModel.findOne({ _id: saleObjId, branchId: branchObjId }).lean();
      return this.toDto(already);
    }

    // 2) lock optimista: sólo DRAFT en este branch
    const locked = await this.saleModel.findOneAndUpdate(
      {
        _id: saleObjId,
        branchId: branchObjId,
        status: SaleStatus.DRAFT,
        voided: { $ne: true },
      },
      {
        $set: {
          status: SaleStatus.PAID,
          paidAt: new Date(),
          paidByUserId: pickUserId(user),
          paidDateKey: dto.dateKey,
        },
      },
      { new: true },
    );

    if (!locked) {
      const cur = await this.saleModel.findOne({ _id: saleObjId, branchId: branchObjId }).lean();
      if (!cur) throw new NotFoundException('Sale not found');
      if (cur.status === SaleStatus.PAID) return this.toDto(cur);
      throw new BadRequestException(`Sale status is ${cur.status}, cannot pay`);
    }

    // 3) caja del día (✅ ideal: tu CashDay debe ser por branch)
    // Si tu firma es getOrCreateDay(user, dateKey, branchId) => pasalo acá.
    const day = await this.cashService.getOrCreateDay(
      user,
      dto.dateKey,
      branchId, // 👈 importante: si tu cash ya es multi-branch
    );

    // 4) movimientos de caja
    const conceptBase = (dto.concept ?? 'VENTA').trim() || 'VENTA';
    const saleLabel = `Sale ${String(locked._id)}`;

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
        refId: String(locked._id),
        branchId, // 👈 si tu CashMovement tiene branchId, pasalo
      } as any);
    }

    // 5) stock (✅ ahora con branchId)
    await this.stockService.applySale({
      branchId,
      dateKey: dto.dateKey,
      saleId: String(sale0._id),
      userId: pickUserId(user) ? String(pickUserId(user)) : null,
      note: dto.note ?? null,
      lines: (sale0.items ?? []).map((it: any) => ({
        productId: String(it.productId),
        qty: Number(it.qty ?? 0),
      })),
    } as any);

    // 6) completar payments/paidTotal/note (ya está PAID)
    const updated = await this.saleModel.findOneAndUpdate(
      { _id: saleObjId, branchId: branchObjId },
      {
        $set: {
          payments: payments as any,
          paidTotal,
          note: dto.note ? String(dto.note).trim() : ((sale0 as any).note ?? null),
        },
      },
      { new: true },
    );

    return this.toDto(updated);
  }

  // ============================
  // Void
  // ============================

  async voidSale(
    user: any,
    branchId: string,
    saleId: string,
    reason?: string | null,
    overrideDateKey?: string | null,
  ) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const saleObjId = this.oidOrThrow(saleId, 'saleId');

    const sale = await this.saleModel.findOne({ _id: saleObjId, branchId: branchObjId });
    if (!sale) throw new NotFoundException('Sale not found');

    if (sale.status === SaleStatus.VOIDED || sale.voided) {
      return this.toDto(sale);
    }

    if (sale.status === SaleStatus.PAID) {
      const dateKey = overrideDateKey ?? (sale as any).paidDateKey;
      if (!dateKey) {
        throw new BadRequestException('paidDateKey missing: provide overrideDateKey');
      }

      // caja mismo día / mismo branch
      const day = await this.cashService.getOrCreateDay(
        user,
        dateKey,
        branchId,
      );

      const concept = 'REVERSION VENTA';
      const saleLabel = `Void Sale ${String(sale._id)}`;

      for (const p of (sale as any).payments ?? []) {
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
          branchId,
        } as any);
      }

      // stock reversal (✅ con branchId)
      await this.stockService.applySaleReversal({
        branchId,
        dateKey,
        saleId: String(sale._id),
        lines: ((sale as any).items ?? []).map((it: any) => ({
          productId: String(it.productId),
          qty: num(it.qty),
        })),
        note: reason ?? null,
        userId: pickUserId(user),
      } as any);
    }

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
      branchId: doc.branchId ? String(doc.branchId) : null,

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
      paidDateKey: doc.paidDateKey ?? null,

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
