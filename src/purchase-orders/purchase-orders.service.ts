// src/purchase-orders/purchase-orders.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
} from './schemas/purchase-order.schema';
import { Supplier } from 'src/suppliers/schemas/supplier.schema';
import { Ingredient } from 'src/ingredients/schemas/ingredients.schema';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderStatus } from './enums/purchase-order.enums';
import { ReceivePurchaseOrderDto } from './dto/receive.dto';
import { AttachInvoiceDto } from './dto/attach-invoice.dto';
import {
  StockMovementReason,
  StockMovementType,
} from 'src/stock/enums/stock.enums';
import { StockMovement } from 'src/stock/schemas/stock-movement.schema';
import { Unit } from 'src/ingredients/enums/unit.enum';

function todayKeyArgentina() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
const UPDATE_AVG_COST = true;
@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<Supplier>,
    @InjectModel(Ingredient.name) private ingredientModel: Model<Ingredient>,
    @InjectModel(StockMovement.name)
    private movementModel: Model<StockMovement>,
  ) {}

  private calcApprox(items: any[]) {
    let approxTotal = 0;
    for (const it of items) {
      const line = num(it.qty) * num(it.approxUnitPrice);
      it.approxLineTotal = line;
      approxTotal += line;
    }
    return approxTotal;
  }

  private calcReal(items: any[]) {
    let realTotal = 0;
    for (const it of items) {
      const price = it.realUnitPrice;
      if (price == null) continue;
      const line = num(it.receivedQty ?? it.qty) * num(price);
      it.realLineTotal = line;
      realTotal += line;
    }
    return realTotal;
  }

  async create(dto: CreatePurchaseOrderDto) {
    const supplier = await this.supplierModel.findById(dto.supplierId).lean();
    if (!supplier) throw new NotFoundException('Supplier not found');

    const itemsInput = dto.items ?? [];
    const ingredientIds = itemsInput.map((x) => x.ingredientId);
    const ings = ingredientIds.length
      ? await this.ingredientModel.find({ _id: { $in: ingredientIds } }).lean()
      : [];

    const ingMap = new Map<string, any>(
      ings.map((i: any) => [String(i._id), i]),
    );

    const items = itemsInput.map((it) => {
      const ing = ingMap.get(String(it.ingredientId));
      if (!ing)
        throw new BadRequestException(
          `Ingredient not found: ${it.ingredientId}`,
        );

      const approxUnitPrice =
        it.approxUnitPrice != null
          ? num(it.approxUnitPrice)
          : num(ing?.cost?.lastCost);

      return {
        ingredientId: new Types.ObjectId(it.ingredientId),
        ingredientName: ing.displayName || ing.name,
        name_for_supplier: ing.name_for_supplier ?? null,
        qty: num(it.qty),
        unit: it.unit ?? ing.baseUnit,
        approxUnitPrice,
        approxLineTotal: 0,
        realUnitPrice: null,
        realLineTotal: null,
        receivedQty: 0,
        note: it.note ?? null,
      };
    });

    const approxTotal = this.calcApprox(items);

    const doc = await this.poModel.create({
      supplierId: new Types.ObjectId(dto.supplierId),
      supplierName: supplier.name,
      status: PurchaseOrderStatus.DRAFT,
      items,
      totals: { approxTotal, realTotal: null, currency: 'ARS' },
      notes: dto.notes ?? null,
    });

    return this.toResponse(doc);
  }

  async findAll(params: {
    supplierId?: string;
    status?: PurchaseOrderStatus;
    limit?: number;
  }) {
    const q: any = { deletedAt: null };
    if (params.supplierId) q.supplierId = new Types.ObjectId(params.supplierId);
    if (params.status) q.status = params.status;

    const limit = Math.min(Math.max(num(params.limit) || 50, 1), 200);

    const rows = await this.poModel
      .find(q)
      .sort({ orderDate: -1 })
      .limit(limit)
      .lean();
    return rows.map((d: any) => this.toResponse(d));
  }

  async findOne(id: string) {
    const doc = await this.poModel.findById(id).lean();
    if (!doc || doc.deletedAt)
      throw new NotFoundException('Purchase order not found');
    return this.toResponse(doc);
  }

  async setStatus(id: string, status: PurchaseOrderStatus) {
    const doc = await this.poModel.findById(id);
    if (!doc || doc.deletedAt)
      throw new NotFoundException('Purchase order not found');

    // Reglas simples (podés endurecerlas)
    if (doc.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('Order is cancelled');
    }

    doc.status = status;
    await doc.save();
    return this.toResponse(doc);
  }

  async attachInvoice(id: string, dto: AttachInvoiceDto) {
    const doc = await this.poModel.findById(id);
    if (!doc || doc.deletedAt)
      throw new NotFoundException('Purchase order not found');

    doc.invoice.imageUrl = dto.imageUrl ?? doc.invoice.imageUrl ?? null;
    doc.invoice.imagePublicId =
      dto.imagePublicId ?? doc.invoice.imagePublicId ?? null;
    doc.invoice.pdfUrl = dto.pdfUrl ?? doc.invoice.pdfUrl ?? null;
    doc.invoice.pdfPublicId =
      dto.pdfPublicId ?? doc.invoice.pdfPublicId ?? null;
    doc.invoice.invoiceNumber =
      dto.invoiceNumber ?? doc.invoice.invoiceNumber ?? null;

    if (dto.invoiceDate) {
      const d = new Date(dto.invoiceDate);
      doc.invoice.invoiceDate = Number.isNaN(d.getTime())
        ? (doc.invoice.invoiceDate ?? null)
        : d;
    }

    await doc.save();
    return this.toResponse(doc);
  }

  private toResponse(d: any) {
    return {
      id: String(d._id),
      supplierId: String(d.supplierId),
      supplierName: d.supplierName,
      status: d.status,
      orderDate: d.orderDate,
      expectedDate: d.expectedDate ?? null,
      notes: d.notes ?? null,
      totals: d.totals,
      invoice: d.invoice,
      items: (d.items ?? []).map((it: any) => ({
        ingredientId: String(it.ingredientId),
        ingredientName: it.ingredientName,
        name_for_supplier: it.name_for_supplier ?? null,
        qty: it.qty,
        unit: it.unit,
        approxUnitPrice: it.approxUnitPrice,
        approxLineTotal: it.approxLineTotal,
        realUnitPrice: it.realUnitPrice ?? null,
        realLineTotal: it.realLineTotal ?? null,
        receivedQty: it.receivedQty ?? 0,
        note: it.note ?? null,
      })),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  async receive(
    id: string,
    dto: ReceivePurchaseOrderDto & { userId?: string | null },
  ) {
    const session = await this.poModel.db.startSession();

    try {
      let result: any;

      await session.withTransaction(async () => {
        const doc = await this.poModel.findById(id).session(session);
        if (!doc || doc.deletedAt)
          throw new NotFoundException('Purchase order not found');

        if (
          [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT].includes(
            doc.status,
          )
        ) {
          throw new BadRequestException(
            'Order must be SENT/CONFIRMED to receive',
          );
        }

        const dateKey = todayKeyArgentina();
        const branchId = null; // igual que tu stock service

        const updMap = new Map(
          dto.items.map((i) => [String(i.ingredientId), i]),
        );

        // deltas para stock
        const deltas: Array<{
          ingredientId: Types.ObjectId;
          deltaQty: number;
          realUnitPrice?: number | null;
          unit: Unit;
        }> = [];

        // 1) update items PO + delta
        for (const it of doc.items as any[]) {
          const upd = updMap.get(String(it.ingredientId));
          if (!upd) continue;

          const prevReceived = num(it.receivedQty);
          const nextReceived =
            upd.receivedQty != null ? num(upd.receivedQty) : prevReceived;

          if (nextReceived < prevReceived) {
            throw new BadRequestException(
              `receivedQty cannot decrease for ingredient ${String(it.ingredientId)}`,
            );
          }

          const delta = nextReceived - prevReceived;
          if (delta > 0) {
            deltas.push({
              ingredientId: it.ingredientId,
              deltaQty: delta,
              realUnitPrice:
                upd.realUnitPrice != null
                  ? num(upd.realUnitPrice)
                  : (it.realUnitPrice ?? null),
              unit: it.unit, // baseUnit del ingrediente normalmente
            });
          }

          it.receivedQty = nextReceived;

          if (upd.realUnitPrice != null) {
            it.realUnitPrice = num(upd.realUnitPrice);
          }
        }

        // 2) aplicar stock + costo y armar movimientos
        const movementDocs: any[] = [];

        for (const d of deltas) {
          const ing = await this.ingredientModel
            .findById(d.ingredientId)
            .session(session);
          if (!ing)
            throw new BadRequestException(
              `Ingredient not found: ${String(d.ingredientId)}`,
            );

          // stock
          const onHand = num((ing as any).stock?.onHand);
          (ing as any).stock = (ing as any).stock ?? {};
          (ing as any).stock.onHand = onHand + d.deltaQty;

          // costo
          if (d.realUnitPrice != null) {
            const prevAvg = num((ing as any).cost?.avgCost);
            (ing as any).cost = (ing as any).cost ?? {};
            (ing as any).cost.lastCost = d.realUnitPrice;

            // promedio simple (rápido). Si querés ponderado, lo cambiamos.
            (ing as any).cost.avgCost =
              prevAvg > 0 ? (prevAvg + d.realUnitPrice) / 2 : d.realUnitPrice;
          }

          await ing.save({ session });

          // movimiento (campos válidos por tu estilo)
          movementDocs.push({
            dateKey,
            branchId,
            type: StockMovementType.IN,
            reason: StockMovementReason.PURCHASE,
            refType: 'PURCHASE',
            refId: String(doc._id),

            ingredientId: new Types.ObjectId(String(d.ingredientId)),
            unit: d.unit,
            qty: +Math.abs(num(d.deltaQty)),

            note: `Recepción PO ${String(doc._id)} (${doc.supplierName})`,
            // elegí UNO. Yo te recomiendo unificar a createdByUserId.
            userId: dto.userId ? String(dto.userId) : null,
          });
        }

        if (movementDocs.length) {
          await this.movementModel.insertMany(movementDocs, { session });
        }

        // 3) recalcular realTotal (tu calcReal)
        const realTotal = this.calcReal(doc.items as any[]);
        doc.totals.realTotal = realTotal;

        // 4) status
        const allReceived = (doc.items as any[]).every(
          (it) => num(it.receivedQty) >= num(it.qty) && num(it.qty) > 0,
        );
        const someReceived = (doc.items as any[]).some(
          (it) => num(it.receivedQty) > 0,
        );

        if (allReceived) doc.status = PurchaseOrderStatus.RECEIVED;
        else if (someReceived)
          doc.status = PurchaseOrderStatus.RECEIVED_PARTIAL;

        await doc.save({ session });

        result = this.toResponse(doc);
      });

      return result;
    } finally {
      session.endSession();
    }
  }
}
