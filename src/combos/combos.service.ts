import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Combo, ComboPricingType } from './schemas/combo.schema';
import { Product } from '../products/schemas/product.schema';

type Currency = 'ARS' | 'USD';

type CreateOrUpdateComboInput = {
  name: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;

  pricingType: ComboPricingType | 'FIXED' | 'DISCOUNT_PCT' | 'DISCOUNT_AMOUNT';
  pricingValue: number;

  currency?: Currency;

  activeFrom?: string | null;
  activeTo?: string | null;

  tags?: string[];
  items: Array<{ productId: string; qty: number; note?: string | null }>;
};

@Injectable()
export class CombosService {
  private readonly logger = new Logger(CombosService.name);

  constructor(
    @InjectModel(Combo.name) private readonly comboModel: Model<Combo>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  async create(input: CreateOrUpdateComboInput, branchId: string) {
    const payload = await this.normalizeInput(input, branchId);
    const computed = await this.computeComboPricing(payload, branchId);

    try {
      const doc = await this.comboModel.create({ ...payload, computed });
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException(
          'Combo already exists (or sku/barcode duplicated)',
        );
      throw e;
    }
  }

  async update(
    id: string,
    input: Partial<CreateOrUpdateComboInput>,
    branchId: string,
  ) {
    const existing = await this.comboModel.findOne({
      _id: this.asObjectId(id),
      branchId: this.asObjectId(branchId),
    });
    if (!existing) throw new NotFoundException('Combo not found');

    const merged = {
      ...this.toPlainForEdit(existing),
      ...input,
    } as any as CreateOrUpdateComboInput;

    const payload = await this.normalizeInput(merged, branchId);
    const computed = await this.computeComboPricing(payload, branchId);

    try {
      const doc = await this.comboModel.findOneAndUpdate(
        { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
        { ...payload, computed },
        { new: true },
      );
      if (!doc) throw new NotFoundException('Combo not found');
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException(
          'Combo already exists (or sku/barcode duplicated)',
        );
      throw e;
    }
  }

  async findAll(params: {
    branchId: string;
    onlyActive?: boolean;
    q?: string;
    tag?: string;
    activeNow?: boolean;
  }) {
    const filter: any = { branchId: this.asObjectId(params.branchId) };

    if (params.onlyActive) filter.isActive = true;

    if (params.tag?.trim()) {
      const tag = params.tag.trim().toLowerCase();
      filter.tags = { $in: [tag] };
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
      ];
    }

    if (params.activeNow) {
      const now = new Date();
      filter.$and = [
        { $or: [{ activeFrom: null }, { activeFrom: { $lte: now } }] },
        { $or: [{ activeTo: null }, { activeTo: { $gte: now } }] },
      ];
    }

    const items = await this.comboModel.find(filter).sort({ name: 1 }).lean();
    return items.map((x: any) => this.toDto(x));
  }

  async findOne(id: string, branchId: string) {
    const doc = await this.comboModel
      .findOne({
        _id: this.asObjectId(id),
        branchId: this.asObjectId(branchId),
      })
      .lean();
    if (!doc) throw new NotFoundException('Combo not found');
    return this.toDto(doc);
  }

  async setActive(id: string, isActive: boolean, branchId: string) {
    const doc = await this.comboModel.findOneAndUpdate(
      { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
      { isActive: !!isActive },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Combo not found');
    return this.toDto(doc);
  }

  async recompute(id: string, branchId: string) {
    const doc = await this.comboModel
      .findOne({
        _id: this.asObjectId(id),
        branchId: this.asObjectId(branchId),
      })
      .lean();
    if (!doc) throw new NotFoundException('Combo not found');

    const payload = await this.normalizeInput(
      this.toPlainForEdit(doc as any),
      branchId,
    );
    const computed = await this.computeComboPricing(payload, branchId);

    const updated = await this.comboModel.findOneAndUpdate(
      { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
      { computed },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Combo not found');
    return this.toDto(updated);
  }

  // ============================================================
  // Normalize
  // ============================================================
  private async normalizeInput(
    input: CreateOrUpdateComboInput,
    branchIdRaw: string,
  ) {
    const branchId = this.asObjectId(branchIdRaw);

    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    const sku = input.sku ? String(input.sku).trim() : null;
    const barcode = input.barcode ? String(input.barcode).trim() : null;

    const pricingType = String(input.pricingType) as ComboPricingType;
    if (!Object.values(ComboPricingType).includes(pricingType)) {
      throw new BadRequestException('Invalid pricingType');
    }

    const pricingValue = this.num(input.pricingValue);
    if (!Number.isFinite(pricingValue) || pricingValue < 0) {
      throw new BadRequestException('pricingValue must be >= 0');
    }

    if (pricingType === ComboPricingType.DISCOUNT_PCT) {
      if (pricingValue < 0 || pricingValue > 1) {
        throw new BadRequestException('DISCOUNT_PCT must be between 0 and 1');
      }
    }

    const currency: Currency = (input.currency as any) || 'ARS';

    const tags = (input.tags ?? [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase());

    const items = (input.items ?? []).map((it) => {
      const pid = String(it.productId || '').trim();
      if (!pid || !Types.ObjectId.isValid(pid)) {
        throw new BadRequestException(
          'items[].productId must be a valid ObjectId',
        );
      }
      const qty = this.num(it.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException('items[].qty must be > 0');
      }
      return {
        productId: new Types.ObjectId(pid),
        qty,
        note: it.note ? String(it.note).trim() : null,
      };
    });

    if (!items.length)
      throw new BadRequestException('At least 1 item is required');

    // no repetir producto dentro del combo
    const seen = new Set<string>();
    for (const it of items) {
      const key = String(it.productId);
      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicated product in items[] (sum qty instead)',
        );
      }
      seen.add(key);
    }

    const activeFrom = input.activeFrom
      ? new Date(String(input.activeFrom))
      : null;
    const activeTo = input.activeTo ? new Date(String(input.activeTo)) : null;

    if (activeFrom && Number.isNaN(activeFrom.getTime()))
      throw new BadRequestException('activeFrom invalid date');
    if (activeTo && Number.isNaN(activeTo.getTime()))
      throw new BadRequestException('activeTo invalid date');
    if (activeFrom && activeTo && activeFrom > activeTo)
      throw new BadRequestException('activeFrom must be <= activeTo');

    // ✅ validar productos existen en branch
    const pids = items.map((x) => x.productId);
    const found = await this.productModel
      .find({ _id: { $in: pids }, branchId })
      .select({ _id: 1, isActive: 1 })
      .lean();

    const foundSet = new Set(found.map((p: any) => String(p._id)));
    const missing = items.filter((x) => !foundSet.has(String(x.productId)));
    if (missing.length) {
      throw new BadRequestException({
        message: 'Some products not found in this branch',
        missingProductIds: missing.map((m) => String(m.productId)),
      });
    }

    return {
      branchId,
      name,
      description: input.description ? String(input.description).trim() : null,
      sku,
      barcode,
      pricingType,
      pricingValue,
      currency,
      activeFrom,
      activeTo,
      tags,
      items,
      isActive: (input as any).isActive ?? true,
    };
  }

  // ============================================================
  // Pricing compute
  // Base: sum( product salePrice ?? product computed.suggestedPrice ?? 0 ) * qty
  // ============================================================
  private async computeComboPricing(payload: any, branchIdRaw: string) {
    const branchId = this.asObjectId(branchIdRaw);

    const productIds = payload.items.map((x: any) => x.productId);

    const products = await this.productModel
      .find({ _id: { $in: productIds }, branchId })
      .select({ salePrice: 1, computed: 1, currency: 1, name: 1 })
      .lean();

    const byId = new Map<string, any>();
    for (const p of products as any[]) byId.set(String(p._id), p);

    let itemsBasePrice = 0;

    for (const it of payload.items) {
      const p = byId.get(String(it.productId));
      if (!p) continue;

      const unit =
        p?.salePrice != null
          ? this.num(p.salePrice)
          : p?.computed?.suggestedPrice != null
            ? this.num(p.computed.suggestedPrice)
            : 0;

      itemsBasePrice += unit * this.num(it.qty);
    }

    const pricingType: ComboPricingType = payload.pricingType;
    const value = this.num(payload.pricingValue);

    let discountAmount = 0;
    let finalPrice = 0;

    if (pricingType === ComboPricingType.FIXED) {
      finalPrice = Math.max(0, value);
      discountAmount = 0;
    }

    if (pricingType === ComboPricingType.DISCOUNT_PCT) {
      discountAmount = -1 * (itemsBasePrice * value);
      finalPrice = Math.max(0, itemsBasePrice + discountAmount);
    }

    if (pricingType === ComboPricingType.DISCOUNT_AMOUNT) {
      discountAmount = -1 * Math.min(itemsBasePrice, value);
      finalPrice = Math.max(0, itemsBasePrice + discountAmount);
    }

    return {
      itemsBasePrice,
      discountAmount,
      finalPrice,
      currency: payload.currency || 'ARS',
      computedAt: new Date(),
    };
  }

  // ============================================================
  // DTO
  // ============================================================
  private toDto(doc: any) {
    return {
      id: String(doc._id ?? doc.id),
      branchId: doc.branchId ? String(doc.branchId) : null,

      name: doc.name,
      description: doc.description ?? null,

      sku: doc.sku ?? null,
      barcode: doc.barcode ?? null,

      pricingType: doc.pricingType,
      pricingValue: this.num(doc.pricingValue),
      currency: doc.currency ?? 'ARS',

      activeFrom: doc.activeFrom ?? null,
      activeTo: doc.activeTo ?? null,

      tags: Array.isArray(doc.tags) ? doc.tags : [],
      isActive: doc.isActive ?? true,

      items: (doc.items ?? []).map((it: any) => ({
        productId: it.productId ? String(it.productId) : null,
        qty: this.num(it.qty),
        note: it.note ?? null,
      })),

      computed: {
        itemsBasePrice: this.num(doc?.computed?.itemsBasePrice ?? 0),
        discountAmount: this.num(doc?.computed?.discountAmount ?? 0),
        finalPrice: this.num(doc?.computed?.finalPrice ?? 0),
        currency: doc?.computed?.currency || doc.currency || 'ARS',
        computedAt: doc?.computed?.computedAt ?? null,
      },

      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toPlainForEdit(doc: any): CreateOrUpdateComboInput {
    return {
      name: doc.name,
      description: doc.description ?? null,
      sku: doc.sku ?? null,
      barcode: doc.barcode ?? null,
      pricingType: doc.pricingType,
      pricingValue: doc.pricingValue,
      currency: doc.currency ?? 'ARS',
      activeFrom: doc.activeFrom
        ? new Date(doc.activeFrom).toISOString()
        : null,
      activeTo: doc.activeTo ? new Date(doc.activeTo).toISOString() : null,
      tags: doc.tags ?? [],
      items: (doc.items ?? []).map((it: any) => ({
        productId: it.productId ? String(it.productId) : null,
        qty: it.qty,
        note: it.note ?? null,
      })),
    };
  }

  private asObjectId(id: string) {
    const s = String(id ?? '').trim();
    if (!s || !Types.ObjectId.isValid(s))
      throw new BadRequestException('Invalid id');
    return new Types.ObjectId(s);
  }

  private num(v: any) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Para stock / recetas:
   * Expande un combo a líneas de productos (qty multiplicada por qty del combo)
   * - scope por branch
   * - valida que exista y esté activo (y opcionalmente dentro de ventana de fechas)
   */
  async expandComboToProducts(
    branchId: string,
    comboId: string,
    qty: number,
    opts?: { onlyIfActiveNow?: boolean },
  ): Promise<Array<{ productId: string; qty: number }>> {
    const bId = this.asObjectId(branchId);
    const cId = this.asObjectId(comboId);

    const q = this.num(qty);
    if (!Number.isFinite(q) || q <= 0) {
      throw new BadRequestException('qty must be > 0');
    }

    const combo = await this.comboModel
      .findOne({ _id: cId, branchId: bId })
      .select({ items: 1, isActive: 1, activeFrom: 1, activeTo: 1 })
      .lean();

    if (!combo) throw new NotFoundException('Combo not found');

    // opcional: validación “active now”
    if (opts?.onlyIfActiveNow) {
      const now = new Date();
      const isWindowOk =
        (!combo.activeFrom || combo.activeFrom <= now) &&
        (!combo.activeTo || combo.activeTo >= now);

      if (!combo.isActive || !isWindowOk) {
        throw new BadRequestException('Combo is not active now');
      }
    }

    const items = Array.isArray(combo.items) ? combo.items : [];
    if (!items.length) {
      throw new BadRequestException('Combo has no items');
    }

    // acumulamos por productId (por si en algún momento permitís repetidos)
    const acc = new Map<string, number>();

    for (const it of items as any[]) {
      const pid = String(it.productId ?? '').trim();
      if (!pid) continue;

      const itQty = this.num(it.qty);
      if (!Number.isFinite(itQty) || itQty <= 0) continue;

      const totalQty = itQty * q;
      acc.set(pid, (acc.get(pid) ?? 0) + totalQty);
    }

    const out = Array.from(acc.entries())
      .map(([productId, qty]) => ({ productId, qty }))
      .filter((x) => x.qty > 0);

    if (!out.length) {
      throw new BadRequestException('Combo expansion resulted in empty lines');
    }

    return out;
  }
}
