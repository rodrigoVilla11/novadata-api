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

function pickFulfillment(v: any): OrderFulfillment {
  const s = String(v || '').toUpperCase();
  if (s === 'DINE_IN') return OrderFulfillment.DINE_IN;
  if (s === 'DELIVERY') return OrderFulfillment.DELIVERY;
  if (s === 'TAKEAWAY') return OrderFulfillment.TAKEAWAY;
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
  // Helpers ObjectId
  // ============================

  private oidOrThrow(id: string, name: string) {
    const s = String(id ?? '').trim();
    if (!s) throw new BadRequestException(`${name} is required`);
    if (!Types.ObjectId.isValid(s))
      throw new BadRequestException(`${name} must be a valid ObjectId`);
    return new Types.ObjectId(s);
  }

  private oidOrNull(id?: string | null, name = 'id') {
    const s = String(id ?? '').trim();
    if (!s) return null;
    if (!Types.ObjectId.isValid(s))
      throw new BadRequestException(`${name} must be a valid ObjectId`);
    return new Types.ObjectId(s);
  }

  // ============================
  // Create
  // ============================

  async create(input: {
    branchId: string; // ✅ requerido
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
    const branchObjId = this.oidOrThrow(input.branchId, 'branchId');

    const source = input.source === 'ONLINE' ? 'ONLINE' : 'POS';
    const fulfillment = pickFulfillment(input.fulfillment);

    const customerObjId = this.oidOrNull(input.customerId, 'customerId');

    const initialStatus =
      source === 'ONLINE' ? OrderStatus.PENDING : OrderStatus.DRAFT;

    const items =
      input.items && input.items.length
        ? await this.buildItemsFromProductIds(branchObjId, input.items)
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

    if (fulfillment === OrderFulfillment.DELIVERY && !customerObjId) {
      const hasSome =
        !!snapshot?.name || !!snapshot?.phone || !!snapshot?.addressLine1;
      if (!hasSome) {
        throw new BadRequestException(
          'DELIVERY requires customerSnapshot (name/phone/address) when no customerId is provided',
        );
      }
    }

    const doc = await this.orderModel.create({
      branchId: branchObjId,
      status: initialStatus,
      source,
      fulfillment,
      customerId: customerObjId,
      customerSnapshot: snapshot,
      note: input.note ?? null,
      items,
      ...totals,
    } as any);

    return this.toDto(doc);
  }

  // ============================
  // Read
  // ============================

  async findAll(params: {
    branchId: string; // ✅ requerido
    status?: OrderStatus;
    source?: 'POS' | 'ONLINE';
    fulfillment?: OrderFulfillment;
    customerId?: string;
    q?: string; // opcional: busca por _id
    limit?: number;
  }) {
    const branchObjId = this.oidOrThrow(params.branchId, 'branchId');

    const filter: any = { branchId: branchObjId };

    if (params?.status) filter.status = params.status;
    if (params?.source) filter.source = params.source;
    if (params?.fulfillment) filter.fulfillment = params.fulfillment;

    if (params?.customerId) {
      filter.customerId = this.oidOrThrow(params.customerId, 'customerId');
    }

    if (params?.q?.trim()) {
      const q = params.q.trim();
      // soporta buscar por _id si es ObjectId
      if (Types.ObjectId.isValid(q)) filter._id = new Types.ObjectId(q);
      else filter._id = q; // si usás ids string (raro), lo deja
    }

    const limit = Math.min(200, Math.max(1, Number(params?.limit ?? 50)));

    const rows = await this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return rows.map((x: any) => this.toDto(x));
  }

  async findOne(branchId: string, id: string) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(id, 'orderId');

    const doc = await this.orderModel
      .findOne({ _id: orderObjId, branchId: branchObjId })
      .lean();

    if (!doc) throw new NotFoundException('Order not found');
    return this.toDto(doc);
  }

  // ============================
  // Edit fulfillment / snapshot (solo DRAFT o PENDING)
  // ============================

  async setFulfillment(
    branchId: string,
    orderId: string,
    fulfillment: OrderFulfillment | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY',
  ) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    const doc = await this.orderModel.findOne({ _id: orderObjId, branchId: branchObjId });
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
    branchId: string,
    orderId: string,
    customerSnapshot: {
      name?: string | null;
      phone?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      notes?: string | null;
    } | null,
  ) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    const doc = await this.orderModel.findOne({ _id: orderObjId, branchId: branchObjId });
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

    if (doc.fulfillment === OrderFulfillment.DELIVERY && !doc.customerId) {
      const s: any = doc.customerSnapshot;
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
  // Edit items / note (solo DRAFT o PENDING)
  // ============================

  async setItems(
    branchId: string,
    orderId: string,
    items: Array<{ productId: string; qty: number; note?: string | null }>,
  ) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    if (!Array.isArray(items))
      throw new BadRequestException('items[] is required');

    const existing = await this.orderModel.findOne({ _id: orderObjId, branchId: branchObjId });
    if (!existing) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(existing.status)) {
      throw new BadRequestException(
        `Cannot edit items when status is ${existing.status}`,
      );
    }

    const built = await this.buildItemsFromProductIds(branchObjId, items);
    const totals = this.computeTotals(built);

    existing.items = built as any;
    existing.subtotal = totals.subtotal;
    existing.total = totals.total;

    await existing.save();
    return this.toDto(existing);
  }

  async setNote(branchId: string, orderId: string, note: string | null) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    const doc = await this.orderModel.findOne({ _id: orderObjId, branchId: branchObjId });
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

  async accept(branchId: string, orderId: string) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    const doc = await this.orderModel.findOne({ _id: orderObjId, branchId: branchObjId });
    if (!doc) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot accept when status is ${doc.status}`,
      );
    }
    if (!doc.items?.length) throw new BadRequestException('Order has no items');

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

  async reject(branchId: string, orderId: string, reason?: string | null) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    const doc = await this.orderModel.findOne({ _id: orderObjId, branchId: branchObjId });
    if (!doc) throw new NotFoundException('Order not found');

    if (![OrderStatus.DRAFT, OrderStatus.PENDING].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot reject when status is ${doc.status}`,
      );
    }

    doc.status = OrderStatus.REJECTED;
    doc.rejectedAt = new Date();
    doc.rejectionReason = reason ? String(reason).trim() : null;

    await doc.save();
    return this.toDto(doc);
  }

  async cancel(branchId: string, orderId: string) {
    const branchObjId = this.oidOrThrow(branchId, 'branchId');
    const orderObjId = this.oidOrThrow(orderId, 'orderId');

    const doc = await this.orderModel.findOne({ _id: orderObjId, branchId: branchObjId });
    if (!doc) throw new NotFoundException('Order not found');

    if ([OrderStatus.ACCEPTED, OrderStatus.REJECTED].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot cancel when status is ${doc.status}`,
      );
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
    branchObjId: Types.ObjectId,
    rawItems: Array<{ productId: string; qty: number; note?: string | null }>,
  ) {
    if (!rawItems.length) return [];

    const merged = new Map<
      string,
      { productId: string; qty: number; note?: string | null }
    >();

    for (const it of rawItems) {
      const productId = String(it.productId ?? '').trim();
      if (!productId)
        throw new BadRequestException('productId is required');
      if (!Types.ObjectId.isValid(productId))
        throw new BadRequestException('productId must be a valid ObjectId');

      const qty = num(it.qty);
      if (!Number.isFinite(qty) || qty <= 0)
        throw new BadRequestException('qty must be > 0');

      const prev = merged.get(productId);
      if (!prev) merged.set(productId, { productId, qty, note: it.note ?? null });
      else prev.qty += qty;
    }

    const ids = Array.from(merged.values()).map(
      (x) => new Types.ObjectId(x.productId),
    );

    // ⚠️ Si Product NO tiene branchId, sacá branchId del filter.
    const products = await this.productModel
      .find({
        _id: { $in: ids },
        branchId: branchObjId,
        isActive: { $ne: false },
      } as any)
      .select({ name: 1, salePrice: 1, computed: 1 })
      .lean();

    const byId = new Map<string, any>();
    for (const p of products as any[]) byId.set(String(p._id), p);

    const built: any[] = [];

    for (const it of merged.values()) {
      const p = byId.get(it.productId);
      if (!p)
        throw new BadRequestException(
          `Product not found/active in branch: ${it.productId}`,
        );

      const salePrice = p.salePrice != null ? num(p.salePrice) : null;
      const suggested =
        p?.computed?.suggestedPrice != null
          ? num(p.computed.suggestedPrice)
          : null;

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

      branchId: doc.branchId ? String(doc.branchId) : null,

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
