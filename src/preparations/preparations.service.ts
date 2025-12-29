import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Preparation } from './schemas/preparation.schema';
import { Ingredient } from '../ingredients/schemas/ingredients.schema';
import { Unit } from '../ingredients/enums/unit.enum';
import { PrepItemType } from './schemas/preparation.schema';

type CreateOrUpdatePrepInput = {
  name: string;
  description?: string | null;
  supplierId?: string | null;

  yieldQty: number;
  yieldUnit: Unit;

  wastePct?: number; // 0..1
  extraCost?: number; // >=0
  currency?: 'ARS' | 'USD';

  items: Array<{
    type: PrepItemType | 'INGREDIENT' | 'PREPARATION';
    ingredientId?: string | null;
    preparationId?: string | null;
    qty: number;
    note?: string | null;
  }>;
};

@Injectable()
export class PreparationsService {
  constructor(
    @InjectModel(Preparation.name) private prepModel: Model<Preparation>,
    @InjectModel(Ingredient.name) private ingModel: Model<Ingredient>,
  ) {}

  // ===========================================================================
  // CRUD
  // ===========================================================================

  async create(input: CreateOrUpdatePrepInput) {
    const payload = this.normalizeInput(input);

    try {
      const doc = await this.prepModel.create(payload);

      // cache computed
      await this.recompute(String((doc as any)._id));

      return this.findOne(String((doc as any)._id));
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Preparation ya existe');
      throw e;
    }
  }

  async findAll(params?: { onlyActive?: boolean }) {
    const filter: any = {};
    if (params?.onlyActive) filter.isActive = true;

    const items = await this.prepModel.find(filter).sort({ name: 1 }).lean();
    return items.map((p: any) => this.toDto(p));
  }

  async findOne(id: string) {
    const doc = await this.prepModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Preparation not found');
    return this.toDto(doc);
  }

  async update(id: string, input: Partial<CreateOrUpdatePrepInput>) {
    const update = this.normalizePartialInput(input);

    const doc = await this.prepModel.findByIdAndUpdate(id, update, { new: true });
    if (!doc) throw new NotFoundException('Preparation not found');

    await this.recompute(id);
    return this.findOne(id);
  }

  async setActive(id: string, isActive: boolean) {
    const doc = await this.prepModel.findByIdAndUpdate(
      id,
      { isActive: !!isActive },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Preparation not found');
    return this.findOne(id);
  }

  // ===========================================================================
  // Cost recompute (recursive, supports PREPARATION as ingredient)
  // ===========================================================================

  async recompute(id: string) {
    const result = await this.computePreparationCost(id, {
      visited: new Set<string>(),
      depth: 0,
      maxDepth: 12,
    });

    await this.prepModel.findByIdAndUpdate(id, {
      computed: {
        ingredientsCost: result.ingredientsCost,
        totalCost: result.totalCost,
        unitCost: result.unitCost,
        currency: result.currency,
        computedAt: new Date(),
      },
    });

    return result;
  }

  private async computePreparationCost(
    prepId: string,
    ctx: { visited: Set<string>; depth: number; maxDepth: number },
  ): Promise<{
    ingredientsCost: number;
    totalCost: number;
    unitCost: number;
    currency: 'ARS' | 'USD';
  }> {
    if (ctx.depth > ctx.maxDepth) {
      throw new ConflictException(
        'Demasiada profundidad en preparations (posible loop).',
      );
    }

    const key = String(prepId);
    if (ctx.visited.has(key)) {
      throw new ConflictException(
        'Loop detectado: una preparación se incluye a sí misma (directo o indirecto).',
      );
    }

    ctx.visited.add(key);

    const prep = await this.prepModel.findById(prepId).lean();
    if (!prep) throw new NotFoundException('Preparation not found');

    const currency: 'ARS' | 'USD' = (prep.currency ?? 'ARS') as any;

    // ---- load ingredients used by this prep
    const ingredientIds = (prep.items || [])
      .filter((it: any) => it.type === PrepItemType.INGREDIENT && it.ingredientId)
      .map((it: any) => it.ingredientId);

    const ings = ingredientIds.length
      ? await this.ingModel
          .find({ _id: { $in: ingredientIds } })
          .select({ cost: 1 })
          .lean()
      : [];

    const ingById = new Map<string, any>();
    for (const ing of ings) ingById.set(String(ing._id), ing);

    // ---- load child preps used by this prep
    const childPrepIds = (prep.items || [])
      .filter((it: any) => it.type === PrepItemType.PREPARATION && it.preparationId)
      .map((it: any) => it.preparationId);

    const childPreps = childPrepIds.length
      ? await this.prepModel
          .find({ _id: { $in: childPrepIds } })
          .select({ computed: 1, currency: 1, yieldQty: 1 })
          .lean()
      : [];

    const childById = new Map<string, any>();
    for (const cp of childPreps) childById.set(String(cp._id), cp);

    // ---- compute items cost
    let ingredientsCost = 0;

    for (const it of prep.items as any[]) {
      const qty = Math.max(0, Number(it.qty ?? 0) || 0);
      if (!qty) continue;

      if (it.type === PrepItemType.INGREDIENT) {
        const ing = ingById.get(String(it.ingredientId));
        const unitCost = Math.max(0, Number(ing?.cost?.lastCost ?? 0) || 0);
        ingredientsCost += qty * unitCost;
        continue;
      }

      if (it.type === PrepItemType.PREPARATION) {
        const childId = String(it.preparationId || '');
        if (!childId) continue;

        const child = childById.get(childId);

        // If cache missing or 0, compute recursively
        let childUnitCost = Number(child?.computed?.unitCost ?? 0) || 0;

        if (!(childUnitCost > 0)) {
          const childRes = await this.computePreparationCost(childId, {
            visited: new Set(ctx.visited),
            depth: ctx.depth + 1,
            maxDepth: ctx.maxDepth,
          });
          childUnitCost = childRes.unitCost;

          // persist child cache to speed up future computations
          await this.prepModel.findByIdAndUpdate(childId, {
            computed: {
              ingredientsCost: childRes.ingredientsCost,
              totalCost: childRes.totalCost,
              unitCost: childRes.unitCost,
              currency: childRes.currency,
              computedAt: new Date(),
            },
          });
        }

        // qty is in child "yield unit" => qty * (cost per output unit)
        ingredientsCost += qty * childUnitCost;
        continue;
      }
    }

    // ---- apply waste + extras
    const waste = Math.max(0, Math.min(1, Number(prep.wastePct ?? 0) || 0));
    const extraCost = Math.max(0, Number(prep.extraCost ?? 0) || 0);

    const wasteFactor = 1 + waste;
    const totalCost = ingredientsCost * wasteFactor + extraCost;

    const yieldQty = Math.max(0, Number(prep.yieldQty ?? 0) || 0);
    const unitCost = yieldQty > 0 ? totalCost / yieldQty : 0;

    return { ingredientsCost, totalCost, unitCost, currency };
  }

  // ===========================================================================
  // Input normalization / validation
  // ===========================================================================

  private normalizeInput(input: CreateOrUpdatePrepInput) {
    const name = String(input.name || '').trim();
    if (!name) throw new ConflictException('name es requerido');

    const yieldQty = Math.max(0, Number(input.yieldQty) || 0);
    if (!(yieldQty > 0)) throw new ConflictException('yieldQty debe ser > 0');

    const wastePct = Math.max(0, Math.min(1, Number(input.wastePct ?? 0) || 0));
    const extraCost = Math.max(0, Number(input.extraCost ?? 0) || 0);

    const currency = (input.currency ?? 'ARS') as 'ARS' | 'USD';
    const supplierId =
      input.supplierId != null && String(input.supplierId).trim()
        ? new Types.ObjectId(String(input.supplierId))
        : null;

    const items = this.normalizeItems(input.items || []);

    return {
      name,
      description: input.description ?? null,
      supplierId,
      yieldQty,
      yieldUnit: input.yieldUnit,
      wastePct,
      extraCost,
      currency,
      items,
      isActive: true,
    };
  }

  private normalizePartialInput(input: Partial<CreateOrUpdatePrepInput>) {
    const update: any = {};

    if (input.name !== undefined) {
      const name = String(input.name || '').trim();
      if (!name) throw new ConflictException('name no puede ser vacío');
      update.name = name;
    }

    if (input.description !== undefined) update.description = input.description ?? null;

    if (input.supplierId !== undefined) {
      update.supplierId =
        input.supplierId != null && String(input.supplierId).trim()
          ? new Types.ObjectId(String(input.supplierId))
          : null;
    }

    if (input.yieldQty !== undefined) {
      const yieldQty = Math.max(0, Number(input.yieldQty) || 0);
      if (!(yieldQty > 0)) throw new ConflictException('yieldQty debe ser > 0');
      update.yieldQty = yieldQty;
    }

    if (input.yieldUnit !== undefined) update.yieldUnit = input.yieldUnit;

    if (input.wastePct !== undefined) {
      update.wastePct = Math.max(0, Math.min(1, Number(input.wastePct) || 0));
    }

    if (input.extraCost !== undefined) {
      update.extraCost = Math.max(0, Number(input.extraCost) || 0);
    }

    if (input.currency !== undefined) update.currency = input.currency;

    if (input.items !== undefined) update.items = this.normalizeItems(input.items || []);

    return update;
  }

  private normalizeItems(
    items: Array<{
      type: PrepItemType | 'INGREDIENT' | 'PREPARATION';
      ingredientId?: string | null;
      preparationId?: string | null;
      qty: number;
      note?: string | null;
    }>,
  ) {
    const out: any[] = [];

    for (const it of items || []) {
      const type = (it?.type as PrepItemType) || PrepItemType.INGREDIENT;
      const qty = Math.max(0, Number(it?.qty ?? 0) || 0);
      if (!qty) continue;

      if (type === PrepItemType.INGREDIENT) {
        const ingredientIdRaw = String(it?.ingredientId || '').trim();
        if (!ingredientIdRaw)
          throw new ConflictException('items: ingredientId requerido cuando type=INGREDIENT');

        out.push({
          type,
          ingredientId: new Types.ObjectId(ingredientIdRaw),
          preparationId: null,
          qty,
          note: it?.note ?? null,
        });
        continue;
      }

      if (type === PrepItemType.PREPARATION) {
        const preparationIdRaw = String(it?.preparationId || '').trim();
        if (!preparationIdRaw)
          throw new ConflictException('items: preparationId requerido cuando type=PREPARATION');

        out.push({
          type,
          ingredientId: null,
          preparationId: new Types.ObjectId(preparationIdRaw),
          qty,
          note: it?.note ?? null,
        });
        continue;
      }

      throw new ConflictException(`items: type inválido "${String(it?.type)}"`);
    }

    // opcional: evitar duplicados exactos (mismo tipo + mismo id)
    // (si querés permitir repetir y sumar, lo hacemos distinto)
    const seen = new Set<string>();
    for (const it of out) {
      const key =
        it.type === PrepItemType.INGREDIENT
          ? `I:${String(it.ingredientId)}`
          : `P:${String(it.preparationId)}`;
      if (seen.has(key))
        throw new ConflictException('items: no repitas el mismo ingrediente/preparación. Sumá la qty.');
      seen.add(key);
    }

    return out;
  }

  // ===========================================================================
  // DTO mapping
  // ===========================================================================

  private toDto(p: any) {
    return {
      id: String(p._id),
      name: p.name,
      description: p.description ?? null,
      supplierId: p.supplierId ? String(p.supplierId) : null,
      isActive: p.isActive ?? true,

      yieldQty: p.yieldQty,
      yieldUnit: p.yieldUnit,
      wastePct: p.wastePct ?? 0,
      extraCost: p.extraCost ?? 0,
      currency: p.currency ?? 'ARS',

      items: (p.items || []).map((it: any) => ({
        type: it.type,
        ingredientId: it.ingredientId ? String(it.ingredientId) : null,
        preparationId: it.preparationId ? String(it.preparationId) : null,
        qty: it.qty,
        note: it.note ?? null,
      })),

      computed: {
        ingredientsCost: p.computed?.ingredientsCost ?? 0,
        totalCost: p.computed?.totalCost ?? 0,
        unitCost: p.computed?.unitCost ?? 0,
        currency: p.computed?.currency ?? (p.currency ?? 'ARS'),
        computedAt: p.computed?.computedAt ?? null,
      },

      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
