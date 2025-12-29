import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Ingredient } from './schemas/ingredients.schema';
import { Unit } from './enums/unit.enum';

type CreateIngredientInput = {
  name: string;
  baseUnit: Unit;
  supplierId: string;

  // nuevo
  name_for_supplier?: string | null;

  // opcionales “paquete completo”
  minQty?: number;
  trackStock?: boolean;

  lastCost?: number;
  avgCost?: number;
  currency?: 'ARS' | 'USD';

  // tags / notas
  tags?: string[];
  notes?: string | null;

  // food props (si querés setear algo de entrada)
  isFood?: boolean;
};

@Injectable()
export class IngredientsService {
  constructor(
    @InjectModel(Ingredient.name) private ingredientModel: Model<Ingredient>,
  ) {}

  // ===========================================================================
  // CREATE
  // ===========================================================================
  async create(input: CreateIngredientInput) {
    const name = String(input.name || '').trim();
    const supplierObjectId = new Types.ObjectId(input.supplierId);

    const nameForSupplier =
      input.name_for_supplier != null
        ? String(input.name_for_supplier).trim()
        : null;

    const minQty = Math.max(0, Number(input.minQty ?? 0) || 0);

    const lastCost = Math.max(0, Number(input.lastCost ?? 0) || 0);
    const avgCost = Math.max(0, Number(input.avgCost ?? 0) || 0);
    const currency = (input.currency ?? 'ARS') as 'ARS' | 'USD';

    try {
      const doc = await this.ingredientModel.create({
        name,
        baseUnit: input.baseUnit,
        supplierId: supplierObjectId,
        name_for_supplier: nameForSupplier,

        isActive: true,

        stock: {
          trackStock: input.trackStock ?? true,
          minQty,
        },

        cost: {
          lastCost,
          avgCost,
          currency,
        },

        tags: Array.isArray(input.tags) ? input.tags : [],
        notes: input.notes ?? null,

        food: {
          isFood: Boolean(input.isFood ?? false),
        },
      });

      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException(
          'Ingredient already exists for this supplier',
        );
      throw e;
    }
  }

  // ===========================================================================
  // FIND ALL
  // ===========================================================================
  async findAll(params?: { supplierId?: string; activeOnly?: boolean }) {
    const filter: any = {};

    if (params?.supplierId)
      filter.supplierId = new Types.ObjectId(params.supplierId);

    if (params?.activeOnly) filter.isActive = true;

    const items = await this.ingredientModel.find(filter).sort({ name: 1 }).lean();

    return items.map((i: any) => this.toDto(i));
  }

  // ===========================================================================
  // SET ACTIVE
  // ===========================================================================
  async setActive(id: string, isActive: boolean) {
    const doc = await this.ingredientModel.findByIdAndUpdate(
      id,
      { isActive: Boolean(isActive) },
      { new: true },
    );

    if (!doc) return null;
    return this.toDto(doc);
  }

  // ===========================================================================
  // SET MIN QTY (stock.minQty)
  // ===========================================================================
  async setMinQty(id: string, minQty: number) {
    const qty = Math.max(0, Number(minQty) || 0);

    const doc = await this.ingredientModel.findByIdAndUpdate(
      id,
      { 'stock.minQty': qty },
      { new: true },
    );

    if (!doc) return null;
    return this.toDto(doc);
  }

  // ===========================================================================
  // SET NAME_FOR_SUPPLIER
  // ===========================================================================
  async setNameForSupplier(id: string, name_for_supplier: string | null) {
    const v =
      name_for_supplier == null ? null : String(name_for_supplier).trim();

    try {
      const doc = await this.ingredientModel.findByIdAndUpdate(
        id,
        { name_for_supplier: v },
        { new: true },
      );
      if (!doc) return null;
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException(
          'name_for_supplier already exists for this supplier',
        );
      throw e;
    }
  }

  // ===========================================================================
  // SET COST (lastCost / avgCost / currency)
  // ===========================================================================
  async setCost(
    id: string,
    input: { lastCost?: number; avgCost?: number; currency?: 'ARS' | 'USD' },
  ) {
    const update: any = {};

    if (input.lastCost != null)
      update['cost.lastCost'] = Math.max(0, Number(input.lastCost) || 0);

    if (input.avgCost != null)
      update['cost.avgCost'] = Math.max(0, Number(input.avgCost) || 0);

    if (input.currency)
      update['cost.currency'] = input.currency === 'USD' ? 'USD' : 'ARS';

    const doc = await this.ingredientModel.findByIdAndUpdate(id, update, {
      new: true,
    });

    if (!doc) return null;
    return this.toDto(doc);
  }

  // ===========================================================================
  // Helper: DTO
  // ===========================================================================
  private toDto(row: any) {
    return {
      id: String(row._id),

      name: row.name,
      displayName: row.displayName ?? null,

      baseUnit: row.baseUnit,
      supplierId: String(row.supplierId),

      name_for_supplier: row.name_for_supplier ?? null,

      isActive: row.isActive ?? true,

      stock: {
        trackStock: row.stock?.trackStock ?? true,
        onHand: row.stock?.onHand ?? 0,
        reserved: row.stock?.reserved ?? 0,
        minQty: row.stock?.minQty ?? 0,
        idealQty: row.stock?.idealQty ?? null,
        storageLocation: row.stock?.storageLocation ?? null,
      },

      cost: {
        lastCost: row.cost?.lastCost ?? 0,
        avgCost: row.cost?.avgCost ?? 0,
        currency: row.cost?.currency ?? 'ARS',
      },

      tags: Array.isArray(row.tags) ? row.tags : [],
      notes: row.notes ?? null,

      food: {
        isFood: row.food?.isFood ?? false,
        allergens: row.food?.allergens ?? [],
        dietFlags: row.food?.dietFlags ?? [],
        wastePct: row.food?.wastePct ?? 0,
        storageType: row.food?.storageType ?? 'AMBIENT',
        shelfLifeDays: row.food?.shelfLifeDays ?? null,
        openedShelfLifeDays: row.food?.openedShelfLifeDays ?? null,
      },

      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
