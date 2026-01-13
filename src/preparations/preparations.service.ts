import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Preparation, PrepItemType } from './schemas/preparation.schema';
import { Ingredient } from '../ingredients/schemas/ingredients.schema';
import { Unit } from '../ingredients/enums/unit.enum';

type CreateOrUpdatePrepInput = {
  // ❌ branchId ya NO viene acá
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
  private readonly logger = new Logger(PreparationsService.name);

  constructor(
    @InjectModel(Preparation.name) private prepModel: Model<Preparation>,
    @InjectModel(Ingredient.name) private ingModel: Model<Ingredient>,
  ) {}

  // ===========================================================================
  // CRUD (scoped)
  // ===========================================================================

  async create(input: CreateOrUpdatePrepInput, branchId: string) {
    const payload = this.normalizeInput(input, branchId);

    try {
      const doc = await this.prepModel.create(payload);

      // cache computed (scoped)
      await this.recompute(String((doc as any)._id), branchId);

      return this.findOne(String((doc as any)._id), branchId);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Preparation ya existe para este branch');
      throw e;
    }
  }

  async findAll(params: {
    branchId: string; // ✅ ahora obligatorio (sale del token)
    onlyActive?: boolean;
    supplierId?: string | null;
    q?: string;
  }) {
    const filter: any = { branchId: this.asObjectId(params.branchId) };

    if (params.onlyActive) filter.isActive = true;

    if (params.supplierId !== undefined) {
      filter.supplierId =
        params.supplierId && String(params.supplierId).trim()
          ? this.asObjectId(String(params.supplierId))
          : null;
    }

    if (params.q?.trim()) {
      const qq = params.q.trim();
      filter.$or = [
        { name: { $regex: qq, $options: 'i' } },
        { description: { $regex: qq, $options: 'i' } },
      ];
    }

    const items = await this.prepModel.find(filter).sort({ name: 1 }).lean();
    return items.map((p: any) => this.toDto(p));
  }

  async findOne(id: string, branchId: string) {
    const doc = await this.prepModel
      .findOne({ _id: this.asObjectId(id), branchId: this.asObjectId(branchId) })
      .lean();

    if (!doc) throw new NotFoundException('Preparation not found');
    return this.toDto(doc);
  }

  async update(id: string, input: Partial<CreateOrUpdatePrepInput>, branchId: string) {
    const update = this.normalizePartialInput(input);

    try {
      const doc = await this.prepModel.findOneAndUpdate(
        { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
        update,
        { new: true },
      );

      if (!doc) throw new NotFoundException('Preparation not found');

      await this.recompute(id, branchId);
      return this.findOne(id, branchId);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Preparation ya existe para este branch');
      throw e;
    }
  }

  async setActive(id: string, isActive: boolean, branchId: string) {
    const doc = await this.prepModel.findOneAndUpdate(
      { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
      { isActive: !!isActive },
      { new: true },
    );

    if (!doc) throw new NotFoundException('Preparation not found');
    return this.findOne(id, branchId);
  }

  // ===========================================================================
  // Cost recompute (recursive, scoped)
  // ===========================================================================

  async recompute(id: string, branchId: string) {
    const result = await this.computePreparationCost(id, branchId, {
      visited: new Set<string>(),
      depth: 0,
      maxDepth: 12,
    });

    await this.prepModel.findOneAndUpdate(
      { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
      {
        computed: {
          ingredientsCost: result.ingredientsCost,
          totalCost: result.totalCost,
          unitCost: result.unitCost,
          currency: result.currency,
          computedAt: new Date(),
        },
      },
      { new: false },
    );

    return result;
  }

  private async computePreparationCost(
    prepId: string,
    branchId: string,
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

    const bId = this.asObjectId(branchId);

    // ✅ scoped: la prep debe pertenecer al branch
    const prep = await this.prepModel
      .findOne({ _id: this.asObjectId(prepId), branchId: bId })
      .lean();

    if (!prep) throw new NotFoundException('Preparation not found');

    const currency: 'ARS' | 'USD' = (prep.currency ?? 'ARS') as any;

    // ---- load ingredients used by this prep (✅ scoped por branch)
    const ingredientIds = (prep.items || [])
      .filter((it: any) => it.type === PrepItemType.INGREDIENT && it.ingredientId)
      .map((it: any) => it.ingredientId);

    const ings = ingredientIds.length
      ? await this.ingModel
          .find({
            _id: { $in: ingredientIds },
            branchId: bId, // ✅ evita mezclar ingredientes de otro branch
          })
          .select({ cost: 1 })
          .lean()
      : [];

    const ingById = new Map<string, any>();
    for (const ing of ings) ingById.set(String(ing._id), ing);

    // ---- load child preps used by this prep (✅ scoped por branch)
    const childPrepIds = (prep.items || [])
      .filter((it: any) => it.type === PrepItemType.PREPARATION && it.preparationId)
      .map((it: any) => it.preparationId);

    const childPreps = childPrepIds.length
      ? await this.prepModel
          .find({
            _id: { $in: childPrepIds },
            branchId: bId, // ✅ no cruza branches
          })
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

        // si el ingrediente no existe en este branch, lo ignoramos (o podrías tirar error)
        if (!ing) continue;

        const unitCost = Math.max(0, Number(ing?.cost?.lastCost ?? 0) || 0);
        ingredientsCost += qty * unitCost;
        continue;
      }

      if (it.type === PrepItemType.PREPARATION) {
        const childId = String(it.preparationId || '');
        if (!childId) continue;

        const child = childById.get(childId);

        // si el child no existe en este branch, ignorar (o error)
        if (!child) continue;

        // If cache missing or 0, compute recursively
        let childUnitCost = Number(child?.computed?.unitCost ?? 0) || 0;

        if (!(childUnitCost > 0)) {
          const childRes = await this.computePreparationCost(childId, branchId, {
            visited: new Set(ctx.visited),
            depth: ctx.depth + 1,
            maxDepth: ctx.maxDepth,
          });

          childUnitCost = childRes.unitCost;

          // persist child cache (✅ scoped)
          await this.prepModel.findOneAndUpdate(
            { _id: this.asObjectId(childId), branchId: bId },
            {
              computed: {
                ingredientsCost: childRes.ingredientsCost,
                totalCost: childRes.totalCost,
                unitCost: childRes.unitCost,
                currency: childRes.currency,
                computedAt: new Date(),
              },
            },
          );
        }

        // qty is in child output unit => qty * (cost per output unit)
        ingredientsCost += qty * childUnitCost;
        continue;
      }
    }

    // ---- apply waste + extras
    const waste = Math.max(0, Math.min(1, Number(prep.wastePct ?? 0) || 0));
    const extraCost = Math.max(0, Number(prep.extraCost ?? 0) || 0);

    const totalCost = ingredientsCost * (1 + waste) + extraCost;

    const yieldQty = Math.max(0, Number(prep.yieldQty ?? 0) || 0);
    const unitCost = yieldQty > 0 ? totalCost / yieldQty : 0;

    return { ingredientsCost, totalCost, unitCost, currency };
  }

  // ===========================================================================
  // Input normalization / validation
  // ===========================================================================

  private normalizeInput(input: CreateOrUpdatePrepInput, branchId: string) {
    const bId = this.asObjectId(branchId);

    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name es requerido');

    const yieldQty = Math.max(0, Number(input.yieldQty) || 0);
    if (!(yieldQty > 0)) throw new BadRequestException('yieldQty debe ser > 0');

    if (!input.yieldUnit) throw new BadRequestException('yieldUnit es requerido');

    const wastePct = Math.max(0, Math.min(1, Number(input.wastePct ?? 0) || 0));
    const extraCost = Math.max(0, Number(input.extraCost ?? 0) || 0);

    const currency = (input.currency ?? 'ARS') as 'ARS' | 'USD';

    const supplierId =
      input.supplierId != null && String(input.supplierId).trim()
        ? this.asObjectId(String(input.supplierId))
        : null;

    const items = this.normalizeItems(input.items || []);

    return {
      branchId: bId,
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
      if (!name) throw new BadRequestException('name no puede ser vacío');
      update.name = name;
    }

    if (input.description !== undefined) update.description = input.description ?? null;

    if (input.supplierId !== undefined) {
      update.supplierId =
        input.supplierId != null && String(input.supplierId).trim()
          ? this.asObjectId(String(input.supplierId))
          : null;
    }

    if (input.yieldQty !== undefined) {
      const yieldQty = Math.max(0, Number(input.yieldQty) || 0);
      if (!(yieldQty > 0)) throw new BadRequestException('yieldQty debe ser > 0');
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
          throw new BadRequestException(
            'items: ingredientId requerido cuando type=INGREDIENT',
          );

        out.push({
          type,
          ingredientId: this.asObjectId(ingredientIdRaw),
          preparationId: null,
          qty,
          note: it?.note ?? null,
        });
        continue;
      }

      if (type === PrepItemType.PREPARATION) {
        const preparationIdRaw = String(it?.preparationId || '').trim();
        if (!preparationIdRaw)
          throw new BadRequestException(
            'items: preparationId requerido cuando type=PREPARATION',
          );

        out.push({
          type,
          ingredientId: null,
          preparationId: this.asObjectId(preparationIdRaw),
          qty,
          note: it?.note ?? null,
        });
        continue;
      }

      throw new BadRequestException(`items: type inválido "${String(it?.type)}"`);
    }

    // evitar duplicados exactos
    const seen = new Set<string>();
    for (const it of out) {
      const key =
        it.type === PrepItemType.INGREDIENT
          ? `I:${String(it.ingredientId)}`
          : `P:${String(it.preparationId)}`;
      if (seen.has(key))
        throw new BadRequestException(
          'items: no repitas el mismo ingrediente/preparación. Sumá la qty.',
        );
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
      branchId: p.branchId ? String(p.branchId) : null,

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

  private asObjectId(id: string) {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    return new Types.ObjectId(id);
  }
}
