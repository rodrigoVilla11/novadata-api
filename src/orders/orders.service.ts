import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Order, OrderFulfillment, OrderStatus } from './schemas/order.schema';
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

function pickFulfillment(v: any): OrderFulfillment {
  const s = String(v || '').toUpperCase();
  if (s === 'DINE_IN') return OrderFulfillment.DINE_IN;
  if (s === 'DELIVERY') return OrderFulfillment.DELIVERY;
  if (s === 'TAKEAWAY') return OrderFulfillment.TAKEAWAY;
  // default razonable POS: takeaway
  return OrderFulfillment.TAKEAWAY;
}

function cleanStr(v: any) {
  const s = String(v ?? '').trim();
  return s ? s : null;
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
    fulfillment?: OrderFulfillment | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
    customerId?: string | null;
    customerSnapshot?: {
      name?: string | null;
      phone?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      notes?: string | null;
    } | null;
    note?: string | null;
    items?: Array<{ productId: string; qty: number; note?: string | null }>;
  }) {
    const source = input.source === 'ONLINE' ? 'ONLINE' : 'POS';
    const fulfillment = pickFulfillment(input.fulfillment);

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

    const snapshot = input.customerSnapshot
      ? {
          name: cleanStr(input.customerSnapshot.name),
          phone: cleanStr(input.customerSnapshot.phone),
          addressLine1: cleanStr(input.customerSnapshot.addressLine1),
          addressLine2: cleanStr(input.customerSnapshot.addressLine2),
          notes: cleanStr(input.customerSnapshot.notes),
        }
      : null;

    // Regla simple: si es DELIVERY y no hay customerId, pedimos al menos nombre o dirección
    if (fulfillment === OrderFulfillment.DELIVERY && !customerId) {
      const hasSome =
        !!snapshot?.name || !!snapshot?.phone || !!snapshot?.addressLine1;
      if (!hasSome) {
        throw new BadRequestException(
          'DELIVERY requires customerSnapshot (name/phone/address) when no customerId is provided',
        );
      }
    }

    const doc = await this.orderModel.create({
      status: initialStatus,
      source,
      fulfillment,
      customerId,
      customerSnapshot: snapshot,
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
    fulfillment?: OrderFulfillment;
    customerId?: string;
    q?: string;
    limit?: number;
  }) {
    const filter: any = {};

    if (params?.status) filter.status = params.status;
    if (params?.source) filter.source = params.source;
    if (params?.fulfillment) filter.fulfillment = params.fulfillment;

    if (params?.customerId)
      filter.customerId = new Types.ObjectId(params.customerId);

    if (params?.q?.trim()) {
      const q = params.q.trim();
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
  // Edit fulfillment / customer snapshot (solo DRAFT o PENDING)
  // ============================

  async setFulfillment(
    orderId: string,
    fulfillment: OrderFulfillment | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY',
  ) {
    assertId(orderId, 'orderId');
    const doc = await this.orderModel.findById(orderId);
    if (!doc) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot edit fulfillment when status is ${doc.status}`,
      );
    }

    doc.fulfillment = pickFulfillment(fulfillment);
    await doc.save();
    return this.toDto(doc);
  }

  async setCustomerSnapshot(
    orderId: string,
    customerSnapshot: {
      name?: string | null;
      phone?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      notes?: string | null;
    } | null,
  ) {
    assertId(orderId, 'orderId');
    const doc = await this.orderModel.findById(orderId);
    if (!doc) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot edit customerSnapshot when status is ${doc.status}`,
      );
    }

    if (!customerSnapshot) {
      doc.customerSnapshot = null;
      await doc.save();
      return this.toDto(doc);
    }

    doc.customerSnapshot = {
      name: cleanStr(customerSnapshot.name),
      phone: cleanStr(customerSnapshot.phone),
      addressLine1: cleanStr(customerSnapshot.addressLine1),
      addressLine2: cleanStr(customerSnapshot.addressLine2),
      notes: cleanStr(customerSnapshot.notes),
    } as any;

    // si queda en DELIVERY sin customerId, chequeo mínimo
    if (doc.fulfillment === OrderFulfillment.DELIVERY && !doc.customerId) {
      const s = doc.customerSnapshot as any;
      const hasSome = !!s?.name || !!s?.phone || !!s?.addressLine1;
      if (!hasSome) {
        throw new BadRequestException(
          'DELIVERY requires customerSnapshot (name/phone/address) when no customerId is provided',
        );
      }
    }

    await doc.save();
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

    // Si es delivery y no hay customerId, exigimos snapshot mínimo
    if (doc.fulfillment === OrderFulfillment.DELIVERY && !doc.customerId) {
      const s: any = doc.customerSnapshot;
      const hasSome = !!s?.name || !!s?.phone || !!s?.addressLine1;
      if (!hasSome) {
        throw new BadRequestException(
          'DELIVERY requires customerSnapshot (name/phone/address) before accept',
        );
      }
    }

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

  private async buildItemsFromProductIds(
    rawItems: Array<{ productId: string; qty: number; note?: string | null }>,
  ) {
    if (!rawItems.length) return [];

    const merged = new Map<
      string,
      { productId: string; qty: number; note?: string | null }
    >();

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

    const ids = Array.from(merged.values()).map(
      (x) => new Types.ObjectId(x.productId),
    );
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
      const suggested =
        p?.computed?.suggestedPrice != null ? num(p.computed.suggestedPrice) : null;

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
    const total = subtotal;
    return { subtotal, total };
  }

  private toDto(doc: any) {
    return {
      id: String(doc._id ?? doc.id),
      status: doc.status,
      source: doc.source,
      fulfillment: doc.fulfillment,

      customerId: doc.customerId ? String(doc.customerId) : null,
      customerSnapshot: doc.customerSnapshot ?? null,

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
