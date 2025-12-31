import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Order, OrderStatus } from './schemas/order.schema';
import { Product } from 'src/products/schemas/product.schema';

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function assertId(id: string, name = 'id') {
  const s = String(id || '').trim();
  if (!s) throw new BadRequestException(`${name} is required`);
  return s;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  // ============================
  // Create
  // ============================

  async create(input: {
    source: 'POS' | 'ONLINE';
    customerId?: string | null;
    note?: string | null;
    // opcional: podés crear con items directo (ONLINE suele hacer esto)
    items?: Array<{ productId: string; qty: number; note?: string | null }>;
  }) {
    const source = input.source === 'ONLINE' ? 'ONLINE' : 'POS';

    const customerId = input.customerId
      ? new Types.ObjectId(input.customerId)
      : null;

    const initialStatus =
      source === 'ONLINE' ? OrderStatus.PENDING : OrderStatus.DRAFT;

    const items =
      input.items && input.items.length
        ? await this.buildItemsFromProductIds(input.items)
        : [];

    const totals = this.computeTotals(items);

    const doc = await this.orderModel.create({
      status: initialStatus,
      source,
      customerId,
      note: input.note ?? null,
      items,
      ...totals,
    });

    return this.toDto(doc);
  }

  // ============================
  // Read
  // ============================

  async findAll(params?: {
    status?: OrderStatus;
    source?: 'POS' | 'ONLINE';
    customerId?: string;
    q?: string; // por ahora: busca por id (simple)
    limit?: number;
  }) {
    const filter: any = {};

    if (params?.status) filter.status = params.status;
    if (params?.source) filter.source = params.source;
    if (params?.customerId)
      filter.customerId = new Types.ObjectId(params.customerId);

    if (params?.q?.trim()) {
      const q = params.q.trim();
      // simple: match por ObjectId string
      filter.$or = [{ _id: q }];
    }

    const limit = Math.min(200, Math.max(1, Number(params?.limit ?? 50)));

    const rows = await this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return rows.map((x: any) => this.toDto(x));
  }

  async findOne(id: string) {
    const doc = await this.orderModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Order not found');
    return this.toDto(doc);
  }

  // ============================
  // Edit items (solo DRAFT o PENDING)
  // ============================

  async setItems(
    orderId: string,
    items: Array<{ productId: string; qty: number; note?: string | null }>,
  ) {
    assertId(orderId, 'orderId');
    if (!Array.isArray(items)) throw new BadRequestException('items[] is required');

    const existing = await this.orderModel.findById(orderId);
    if (!existing) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(existing.status)) {
      throw new BadRequestException(
        `Cannot edit items when status is ${existing.status}`,
      );
    }

    const built = await this.buildItemsFromProductIds(items);
    const totals = this.computeTotals(built);

    existing.items = built as any;
    existing.subtotal = totals.subtotal;
    existing.total = totals.total;

    await existing.save();
    return this.toDto(existing);
  }

  async setNote(orderId: string, note: string | null) {
    const doc = await this.orderModel.findById(orderId);
    if (!doc) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot edit note when status is ${doc.status}`,
      );
    }

    doc.note = note ? String(note).trim() : null;
    await doc.save();
    return this.toDto(doc);
  }

  // ============================
  // Status transitions
  // ============================

  async accept(orderId: string) {
    const doc = await this.orderModel.findById(orderId);
    if (!doc) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(doc.status)) {
      throw new BadRequestException(`Cannot accept when status is ${doc.status}`);
    }
    if (!doc.items?.length) throw new BadRequestException('Order has no items');

    doc.status = OrderStatus.ACCEPTED;
    doc.acceptedAt = new Date();
    doc.rejectionReason = null;
    await doc.save();

    return this.toDto(doc);
  }

  async reject(orderId: string, reason?: string | null) {
    const doc = await this.orderModel.findById(orderId);
    if (!doc) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(doc.status)) {
      throw new BadRequestException(`Cannot reject when status is ${doc.status}`);
    }

    doc.status = OrderStatus.REJECTED;
    doc.rejectedAt = new Date();
    doc.rejectionReason = reason ? String(reason).trim() : null;
    await doc.save();

    return this.toDto(doc);
  }

  async cancel(orderId: string) {
    const doc = await this.orderModel.findById(orderId);
    if (!doc) throw new NotFoundException('Order not found');

    if ([OrderStatus.ACCEPTED, OrderStatus.REJECTED].includes(doc.status)) {
      throw new BadRequestException(`Cannot cancel when status is ${doc.status}`);
    }

    doc.status = OrderStatus.CANCELLED;
    doc.cancelledAt = new Date();
    await doc.save();

    return this.toDto(doc);
  }

  // ============================
  // Internals
  // ============================

  /**
   * Arma items con unitPrice snapshot usando Product.salePrice
   * fallback: Product.computed?.suggestedPrice
   */
  private async buildItemsFromProductIds(
    rawItems: Array<{ productId: string; qty: number; note?: string | null }>,
  ) {
    if (!rawItems.length) return [];

    // normalizar + merge por productId
    const merged = new Map<string, { productId: string; qty: number; note?: string | null }>();

    for (const it of rawItems) {
      const productId = assertId(it.productId, 'productId');
      const qty = num(it.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException('qty must be > 0');
      }
      const prev = merged.get(productId);
      if (!prev) merged.set(productId, { productId, qty, note: it.note ?? null });
      else prev.qty += qty;
    }

    const ids = Array.from(merged.values()).map((x) => new Types.ObjectId(x.productId));
    const products = await this.productModel
      .find({ _id: { $in: ids }, isActive: { $ne: false } })
      .select({ name: 1, salePrice: 1, computed: 1 })
      .lean();

    const byId = new Map<string, any>();
    for (const p of products as any[]) byId.set(String(p._id), p);

    const built: any[] = [];

    for (const it of merged.values()) {
      const p = byId.get(it.productId);
      if (!p) throw new BadRequestException(`Product not found/active: ${it.productId}`);

      const salePrice = p.salePrice != null ? num(p.salePrice) : null;
      const suggested = p?.computed?.suggestedPrice != null ? num(p.computed.suggestedPrice) : null;

      const unitPrice = salePrice ?? suggested ?? 0;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(`Invalid price for product ${it.productId}`);
      }

      const qty = num(it.qty);
      const lineTotal = qty * unitPrice;

      built.push({
        productId: new Types.ObjectId(it.productId),
        qty,
        unitPrice,
        lineTotal,
        note: it.note ?? null,
      });
    }

    return built;
  }

  private computeTotals(items: any[]) {
    const subtotal = items.reduce((acc, it) => acc + num(it.lineTotal), 0);
    const total = subtotal; // por ahora sin impuestos/desc
    return { subtotal, total };
  }

  private toDto(doc: any) {
    return {
      id: String(doc._id ?? doc.id),
      status: doc.status,
      source: doc.source,
      customerId: doc.customerId ? String(doc.customerId) : null,
      note: doc.note ?? null,
      rejectionReason: doc.rejectionReason ?? null,

      subtotal: num(doc.subtotal),
      total: num(doc.total),

      items: (doc.items ?? []).map((it: any) => ({
        productId: it.productId ? String(it.productId) : null,
        qty: num(it.qty),
        unitPrice: num(it.unitPrice),
        lineTotal: num(it.lineTotal),
        note: it.note ?? null,
      })),

      acceptedAt: doc.acceptedAt ?? null,
      rejectedAt: doc.rejectedAt ?? null,
      cancelledAt: doc.cancelledAt ?? null,

      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
