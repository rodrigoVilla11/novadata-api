import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Allergen, Product, ProductItemType } from './schemas/product.schema';
import { Unit } from '../ingredients/enums/unit.enum';

import { Ingredient } from '../ingredients/schemas/ingredients.schema';
import { Preparation } from '../preparations/schemas/preparation.schema';
import { Category } from '../categories/schemas/category.schema';

type Currency = 'ARS' | 'USD';
type CreateOrUpdateProductInput = {
  name: string;
  description?: string | null;

  // ❌ branchId ya NO viene acá
  supplierId?: string | null;
  categoryId?: string | null;

  sku?: string | null;
  barcode?: string | null;

  isSellable?: boolean;
  isProduced?: boolean;

  yieldQty: number;
  yieldUnit: Unit;

  portionSize?: number | null;
  portionLabel?: string | null;

  wastePct?: number; // 0..1
  extraCost?: number;
  packagingCost?: number;

  currency?: Currency;

  salePrice?: number | null;
  marginPct?: number | null;

  tags?: string[];
  allergens?: Allergen[];

  imageUrl?: string | null;
  galleryUrls?: string[];

  items: Array<{
    type: ProductItemType | 'INGREDIENT' | 'PREPARATION';
    ingredientId?: string | null;
    preparationId?: string | null;
    qty: number;
    note?: string | null;
  }>;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Ingredient.name)
    private readonly ingredientModel: Model<Ingredient>,
    @InjectModel(Preparation.name)
    private readonly preparationModel: Model<Preparation>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
  ) {}

  async create(input: CreateOrUpdateProductInput, branchId: string) {
    const payload = await this.normalizeInput(input, branchId);
    const computed = await this.computeCosts(payload, branchId);

    try {
      const doc = await this.productModel.create({ ...payload, computed });
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException(
          'Product already exists (or sku/barcode duplicated)',
        );
      throw e;
    }
  }

  async update(
    id: string,
    input: Partial<CreateOrUpdateProductInput>,
    branchId: string,
  ) {
    const existing = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      branchId: new Types.ObjectId(branchId),
    });
    if (!existing) throw new NotFoundException('Product not found');

    const merged = {
      ...this.toPlainForEdit(existing),
      ...input,
    } as any as CreateOrUpdateProductInput;

    const payload = await this.normalizeInput(merged, branchId);
    const computed = await this.computeCosts(payload, branchId);

    try {
      const doc = await this.productModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), branchId: new Types.ObjectId(branchId) },
        { ...payload, computed },
        { new: true },
      );
      if (!doc) throw new NotFoundException('Product not found');
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException(
          'Product already exists (or sku/barcode duplicated)',
        );
      throw e;
    }
  }

  async findAll(params: {
    branchId: string; // ✅ obligatorio
    onlyActive?: boolean;
    supplierId?: string;
    categoryId?: string;
    q?: string;
    tag?: string;
    sellable?: boolean;
  }) {
    const filter: any = { branchId: new Types.ObjectId(params.branchId) };

    if (params.onlyActive) filter.isActive = true;
    if (params.sellable != null) filter.isSellable = !!params.sellable;

    if (params.supplierId)
      filter.supplierId = new Types.ObjectId(params.supplierId);
    if (params.categoryId)
      filter.categoryId = new Types.ObjectId(params.categoryId);

    if (params.tag?.trim()) {
      const tag = params.tag.trim().toLowerCase();
      filter.tags = { $in: [tag] };
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { categoryName: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
      ];
    }

    const items = await this.productModel.find(filter).sort({ name: 1 }).lean();
    return items.map((x: any) => this.toDto(x));
  }

  async findOne(id: string, branchId: string) {
    const doc = await this.productModel
      .findOne({
        _id: new Types.ObjectId(id),
        branchId: new Types.ObjectId(branchId),
      })
      .lean();
    if (!doc) throw new NotFoundException('Product not found');
    return this.toDto(doc);
  }

  async setActive(id: string, isActive: boolean, branchId: string) {
    const doc = await this.productModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), branchId: new Types.ObjectId(branchId) },
      { isActive: !!isActive },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Product not found');
    return this.toDto(doc);
  }

  async recompute(id: string, branchId: string) {
    const doc = await this.productModel
      .findOne({
        _id: new Types.ObjectId(id),
        branchId: new Types.ObjectId(branchId),
      })
      .lean();
    if (!doc) throw new NotFoundException('Product not found');

    // normaliza usando SIEMPRE el branch del token
    const payload = await this.normalizeInput(
      {
        name: (doc as any).name,
        description: (doc as any).description ?? null,
        supplierId: (doc as any).supplierId
          ? String((doc as any).supplierId)
          : null,
        categoryId: (doc as any).categoryId
          ? String((doc as any).categoryId)
          : null,
        sku: (doc as any).sku ?? null,
        barcode: (doc as any).barcode ?? null,
        isSellable: (doc as any).isSellable ?? true,
        isProduced: (doc as any).isProduced ?? true,
        yieldQty: (doc as any).yieldQty ?? 1,
        yieldUnit: (doc as any).yieldUnit ?? Unit.UNIT,
        portionSize: (doc as any).portionSize ?? null,
        portionLabel: (doc as any).portionLabel ?? null,
        wastePct: (doc as any).wastePct ?? 0,
        extraCost: (doc as any).extraCost ?? 0,
        packagingCost: (doc as any).packagingCost ?? 0,
        currency: (doc as any).currency ?? 'ARS',
        salePrice: (doc as any).salePrice ?? null,
        marginPct: (doc as any).marginPct ?? null,
        tags: (doc as any).tags ?? [],
        allergens: (doc as any).allergens ?? [],
        imageUrl: (doc as any).imageUrl ?? null,
        galleryUrls: (doc as any).galleryUrls ?? [],
        items: (doc as any).items ?? [],
      } as any,
      branchId,
    );

    const computed = await this.computeCosts(payload, branchId);

    const updated = await this.productModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), branchId: new Types.ObjectId(branchId) },
      { computed },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Product not found');
    return this.toDto(updated);
  }

  // =====================================================================
  // Bootstrap: Common items bulk add
  // =====================================================================

  private readonly COMMON_ITEMS_TO_ADD = [
    {
      type: ProductItemType.INGREDIENT,
      ingredientId: new Types.ObjectId('69583e73062c62fe0ec759ab'),
      preparationId: null,
      qty: 1,
      note: null,
    },
    {
      type: ProductItemType.INGREDIENT,
      ingredientId: new Types.ObjectId('69583e73062c62fe0ec759b4'),
      preparationId: null,
      qty: 1,
      note: null,
    },
    {
      type: ProductItemType.INGREDIENT,
      ingredientId: new Types.ObjectId('69583e73062c62fe0ec759aa'),
      preparationId: null,
      qty: 1,
      note: null,
    },
    {
      type: ProductItemType.INGREDIENT,
      ingredientId: new Types.ObjectId('69583e73062c62fe0ec759c3'),
      preparationId: null,
      qty: 1,
      note: null,
    },
  ] as const;

  private itemKey(it: any) {
    if (it?.type === ProductItemType.INGREDIENT)
      return `I:${String(it.ingredientId)}`;
    if (it?.type === ProductItemType.PREPARATION)
      return `P:${String(it.preparationId)}`;
    return `?:${String(it?.type)}`;
  }

  // ✅ Scoper: addCommonItemsToAllProducts (branchId desde token)
  // - Recibe branchId obligatorio (del controller)
  // - Filtra por branchId siempre
  // - El update también incluye branchId (seguridad extra)
  // - Si recompute=true, llama recompute(id, branchId)

  async addCommonItemsToAllProducts(
    branchId: string,
    opts?: {
      onlyActive?: boolean;
      recompute?: boolean;
      dryRun?: boolean;
    },
  ) {
    const bId = new Types.ObjectId(branchId);

    const filter: any = { branchId: bId };
    if (opts?.onlyActive) filter.isActive = true;

    const cursor = this.productModel
      .find(filter, { items: 1, name: 1 })
      .cursor();

    let total = 0;
    let touched = 0;
    let addedItems = 0;

    for await (const p of cursor as any) {
      total++;

      const items = Array.isArray(p.items) ? p.items : [];
      const seen = new Set(items.map((x: any) => this.itemKey(x)));

      const toAdd = this.COMMON_ITEMS_TO_ADD.filter(
        (x) => !seen.has(this.itemKey(x)),
      );
      if (!toAdd.length) continue;

      touched++;
      addedItems += toAdd.length;

      if (opts?.dryRun) continue;

      // ✅ seguridad: scope branch en el update también
      await this.productModel.updateOne(
        { _id: p._id, branchId: bId },
        { $push: { items: { $each: toAdd } } },
      );

      if (opts?.recompute) {
        await this.recompute(String(p._id), branchId);
      }
    }

    return {
      ok: true,
      branchId,
      total,
      touched,
      addedItems,
      dryRun: !!opts?.dryRun,
      recompute: !!opts?.recompute,
    };
  }

  // =====================================================================
  // Normalize + Category integration
  // =====================================================================
  private async normalizeInput(
    input: CreateOrUpdateProductInput,
    branchIdRaw: string,
  ) {
    if (!branchIdRaw || !Types.ObjectId.isValid(branchIdRaw)) {
      throw new BadRequestException('branchId is required');
    }
    const branchId = new Types.ObjectId(branchIdRaw);

    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    const yieldQty = this.num(input.yieldQty ?? 1);
    if (!Number.isFinite(yieldQty) || yieldQty <= 0) {
      throw new BadRequestException('yieldQty must be > 0');
    }

    const wastePct = this.clamp01(this.num(input.wastePct ?? 0));
    const extraCost = Math.max(0, this.num(input.extraCost ?? 0));
    const packagingCost = Math.max(0, this.num(input.packagingCost ?? 0));

    const currency: Currency = (input.currency as any) || 'ARS';

    const salePrice =
      input.salePrice == null ? null : Math.max(0, this.num(input.salePrice));
    const marginPct =
      input.marginPct == null ? null : this.clamp01(this.num(input.marginPct));

    const supplierId =
      input.supplierId && String(input.supplierId).trim()
        ? new Types.ObjectId(String(input.supplierId))
        : null;

    const sku = input.sku ? String(input.sku).trim() : null;
    const barcode = input.barcode ? String(input.barcode).trim() : null;

    const isSellable = input.isSellable ?? true;
    const isProduced = input.isProduced ?? true;

    const portionSize =
      input.portionSize == null
        ? null
        : Math.max(0, this.num(input.portionSize));
    const portionLabel = input.portionLabel
      ? String(input.portionLabel).trim()
      : null;

    const tags = (input.tags ?? [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase());

    const allergens = Array.isArray(input.allergens) ? input.allergens : [];

    const imageUrl = input.imageUrl ? String(input.imageUrl).trim() : null;
    const galleryUrls = (input.galleryUrls ?? [])
      .map((u) => String(u || '').trim())
      .filter(Boolean);

    const items = (input.items ?? []).map((it) => {
      const type = it.type as any as ProductItemType;
      const qty = this.num(it.qty);

      if (
        type !== ProductItemType.INGREDIENT &&
        type !== ProductItemType.PREPARATION
      ) {
        throw new BadRequestException('Invalid item type');
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException('Item qty must be > 0');
      }

      const ingredientId =
        type === ProductItemType.INGREDIENT
          ? it.ingredientId
            ? new Types.ObjectId(it.ingredientId)
            : null
          : null;

      const preparationId =
        type === ProductItemType.PREPARATION
          ? it.preparationId
            ? new Types.ObjectId(it.preparationId)
            : null
          : null;

      if (type === ProductItemType.INGREDIENT && !ingredientId) {
        throw new BadRequestException(
          'ingredientId is required for INGREDIENT item',
        );
      }
      if (type === ProductItemType.PREPARATION && !preparationId) {
        throw new BadRequestException(
          'preparationId is required for PREPARATION item',
        );
      }

      return {
        type,
        ingredientId,
        preparationId,
        qty,
        note: it.note ? String(it.note).trim() : null,
      };
    });

    const seen = new Set<string>();
    for (const it of items) {
      const key =
        it.type === ProductItemType.INGREDIENT
          ? `I:${String(it.ingredientId)}`
          : `P:${String(it.preparationId)}`;
      if (seen.has(key))
        throw new BadRequestException('Duplicated item in items[]');
      seen.add(key);
    }
    if (!items.length)
      throw new BadRequestException('At least 1 item is required');

    // Category: validate + hydrate categoryName (✅ scoped por branch)
    let categoryId: Types.ObjectId | null = null;
    let categoryName: string | null = null;

    if (input.categoryId) {
      categoryId = new Types.ObjectId(input.categoryId);

      const cat = await this.categoryModel
        .findOne({ _id: categoryId, branchId })
        .select({ name: 1 })
        .lean();

      if (!cat)
        throw new BadRequestException(
          'categoryId not found (or belongs to another branch)',
        );

      categoryName = String((cat as any).name || '').trim() || null;
    }

    return {
      name,
      description: input.description ? String(input.description).trim() : null,
      branchId,
      supplierId,
      categoryId,
      categoryName,
      sku,
      barcode,
      isSellable: !!isSellable,
      isProduced: !!isProduced,
      yieldQty,
      yieldUnit: input.yieldUnit,
      portionSize,
      portionLabel,
      wastePct,
      extraCost,
      packagingCost,
      currency,
      salePrice,
      marginPct,
      tags,
      allergens,
      imageUrl,
      galleryUrls,
      items,
      isActive: (input as any).isActive ?? true,
    };
  }

  // =====================================================================
  // Cost compute
  // =====================================================================

  private async computeCosts(payload: any, branchIdRaw: string) {
    const branchId = new Types.ObjectId(branchIdRaw);

    const ingredientIds = payload.items
      .filter((x: any) => x.type === ProductItemType.INGREDIENT)
      .map((x: any) => x.ingredientId)
      .filter(Boolean);

    const preparationIds = payload.items
      .filter((x: any) => x.type === ProductItemType.PREPARATION)
      .map((x: any) => x.preparationId)
      .filter(Boolean);

    const [ings, preps] = await Promise.all([
      ingredientIds.length
        ? this.ingredientModel
            .find({ _id: { $in: ingredientIds }, branchId })
            .lean()
        : Promise.resolve([]),
      preparationIds.length
        ? this.preparationModel
            .find({ _id: { $in: preparationIds }, branchId })
            .lean()
        : Promise.resolve([]),
    ]);

    const ingById = new Map<string, any>();
    for (const i of ings as any[]) ingById.set(String(i._id), i);

    const prepById = new Map<string, any>();
    for (const p of preps as any[]) prepById.set(String(p._id), p);

    let ingredientsCost = 0;

    for (const it of payload.items) {
      const qty = this.num(it.qty);

      if (it.type === ProductItemType.INGREDIENT) {
        const ing = ingById.get(String(it.ingredientId));
        if (!ing)
          throw new BadRequestException(
            `Ingredient not found in branch: ${String(it.ingredientId)}`,
          );

        const unitCost = this.num(ing?.cost?.lastCost ?? 0);
        ingredientsCost += qty * unitCost;
      } else {
        const prep = prepById.get(String(it.preparationId));
        if (!prep)
          throw new BadRequestException(
            `Preparation not found in branch: ${String(it.preparationId)}`,
          );

        const unitCost = this.num(prep?.computed?.unitCost ?? 0);
        ingredientsCost += qty * unitCost;
      }
    }

    const wastePct = this.clamp01(this.num(payload.wastePct ?? 0));
    const extraCost = Math.max(0, this.num(payload.extraCost ?? 0));
    const packagingCost = Math.max(0, this.num(payload.packagingCost ?? 0));
    const yieldQty = Math.max(0.000001, this.num(payload.yieldQty ?? 1));

    const totalCost =
      ingredientsCost * (1 + wastePct) + extraCost + packagingCost;
    const unitCost = totalCost / yieldQty;

    const salePrice =
      payload.salePrice == null
        ? null
        : Math.max(0, this.num(payload.salePrice));
    const marginPct =
      payload.marginPct == null
        ? null
        : this.clamp01(this.num(payload.marginPct));

    const suggestedPrice =
      salePrice != null
        ? null
        : marginPct != null && marginPct < 1
          ? unitCost / (1 - marginPct)
          : null;

    const marginPctUsed = salePrice == null ? marginPct : null;

    const grossMarginPct =
      salePrice != null && salePrice > 0
        ? this.clamp01((salePrice - unitCost) / salePrice)
        : null;

    return {
      ingredientsCost,
      totalCost,
      unitCost,
      suggestedPrice,
      marginPctUsed,
      grossMarginPct,
      currency: payload.currency || 'ARS',
      computedAt: new Date(),
    };
  }

  // =====================================================================
  // DTO
  // =====================================================================

  private toDto(doc: any) {
    return {
      id: String(doc._id ?? doc.id),
      name: doc.name,
      description: doc.description ?? null,

      branchId: doc.branchId ? String(doc.branchId) : null,
      supplierId: doc.supplierId ? String(doc.supplierId) : null,

      categoryId: doc.categoryId ? String(doc.categoryId) : null,
      categoryName: doc.categoryName ?? null,

      sku: doc.sku ?? null,
      barcode: doc.barcode ?? null,

      isSellable: doc.isSellable ?? true,
      isProduced: doc.isProduced ?? true,

      yieldQty: this.num(doc.yieldQty ?? 1),
      yieldUnit: doc.yieldUnit,

      portionSize: doc.portionSize ?? null,
      portionLabel: doc.portionLabel ?? null,

      wastePct: this.num(doc.wastePct ?? 0),
      extraCost: this.num(doc.extraCost ?? 0),
      packagingCost: this.num(doc.packagingCost ?? 0),

      currency: (doc.currency as Currency) || 'ARS',

      salePrice: doc.salePrice ?? null,
      marginPct: doc.marginPct ?? null,

      tags: Array.isArray(doc.tags) ? doc.tags : [],
      allergens: Array.isArray(doc.allergens) ? doc.allergens : [],

      imageUrl: doc.imageUrl ?? null,
      galleryUrls: Array.isArray(doc.galleryUrls) ? doc.galleryUrls : [],

      isActive: doc.isActive ?? true,

      items: (doc.items ?? []).map((it: any) => ({
        type: it.type,
        ingredientId: it.ingredientId ? String(it.ingredientId) : null,
        preparationId: it.preparationId ? String(it.preparationId) : null,
        qty: this.num(it.qty),
        note: it.note ?? null,
      })),

      computed: {
        ingredientsCost: this.num(doc?.computed?.ingredientsCost ?? 0),
        totalCost: this.num(doc?.computed?.totalCost ?? 0),
        unitCost: this.num(doc?.computed?.unitCost ?? 0),
        suggestedPrice: doc?.computed?.suggestedPrice ?? null,
        marginPctUsed: doc?.computed?.marginPctUsed ?? null,
        grossMarginPct: doc?.computed?.grossMarginPct ?? null,
        currency:
          doc?.computed?.currency || (doc.currency as Currency) || 'ARS',
        computedAt: doc?.computed?.computedAt ?? null,
      },

      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toPlainForEdit(doc: any) {
    return {
      name: doc.name,
      description: doc.description ?? null,

      branchId: doc.branchId ? String(doc.branchId) : null,
      supplierId: doc.supplierId ? String(doc.supplierId) : null,

      categoryId: doc.categoryId ? String(doc.categoryId) : null,

      sku: doc.sku ?? null,
      barcode: doc.barcode ?? null,

      isSellable: doc.isSellable ?? true,
      isProduced: doc.isProduced ?? true,

      yieldQty: doc.yieldQty ?? 1,
      yieldUnit: doc.yieldUnit ?? Unit.UNIT,

      portionSize: doc.portionSize ?? null,
      portionLabel: doc.portionLabel ?? null,

      wastePct: doc.wastePct ?? 0,
      extraCost: doc.extraCost ?? 0,
      packagingCost: doc.packagingCost ?? 0,

      currency: doc.currency ?? 'ARS',

      salePrice: doc.salePrice ?? null,
      marginPct: doc.marginPct ?? null,

      tags: doc.tags ?? [],
      allergens: doc.allergens ?? [],

      imageUrl: doc.imageUrl ?? null,
      galleryUrls: doc.galleryUrls ?? [],

      items: (doc.items ?? []).map((it: any) => ({
        type: it.type,
        ingredientId: it.ingredientId ? String(it.ingredientId) : null,
        preparationId: it.preparationId ? String(it.preparationId) : null,
        qty: it.qty,
        note: it.note ?? null,
      })),
    };
  }

  private num(v: any) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }
}
