import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Ingredient } from './schemas/ingredients.schema';
import { Unit } from './enums/unit.enum';

type CreateIngredientInput = {
  name: string;
  baseUnit: Unit;
  supplierId: string;

  name_for_supplier?: string | null;

  minQty?: number;
  trackStock?: boolean;

  lastCost?: number;
  avgCost?: number;
  currency?: 'ARS' | 'USD';

  tags?: string[];
  notes?: string | null;

  isFood?: boolean;
};

@Injectable()
export class IngredientsService {
  private readonly logger = new Logger(IngredientsService.name);

  constructor(
    @InjectModel(Ingredient.name) private ingredientModel: Model<Ingredient>,
  ) {}

  // ===========================================================================
  // CREATE (scoped)
  // ===========================================================================
  async create(input: CreateIngredientInput, branchId: string) {
    const bId = this.asObjectId(branchId);

    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    if (!input.baseUnit) throw new BadRequestException('baseUnit is required');

    const supplierObjectId = this.asObjectId(input.supplierId);

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
        branchId: bId,

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
      if (e?.code === 11000) {
        // Puede ser por (branchId,name) o (branchId,supplierId,name_for_supplier)
        throw new ConflictException('Ingredient already exists');
      }
      throw e;
    }
  }

  // ===========================================================================
  // FIND ALL (scoped)
  // ===========================================================================
  async findAll(params: {
    branchId: string;
    supplierId?: string;
    activeOnly?: boolean;
    q?: string;
    tag?: string;
  }) {
    const filter: any = { branchId: this.asObjectId(params.branchId) };

    if (params.supplierId) filter.supplierId = this.asObjectId(params.supplierId);
    if (params.activeOnly) filter.isActive = true;

    if (params.tag?.trim()) {
      filter.tags = params.tag.trim().toLowerCase();
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } },
        { name_for_supplier: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
      ];
    }

    const items = await this.ingredientModel
      .find(filter)
      .sort({ name: 1 })
      .lean();

    return items.map((i: any) => this.toDto(i));
  }

  // ===========================================================================
  // FIND ONE (scoped)
  // ===========================================================================
  async findOne(id: string, branchId: string) {
    const doc = await this.ingredientModel
      .findOne({ _id: this.asObjectId(id), branchId: this.asObjectId(branchId) })
      .lean();

    if (!doc) throw new NotFoundException('Ingredient not found');
    return this.toDto(doc);
  }

  // ===========================================================================
  // SET ACTIVE (scoped)
  // ===========================================================================
  async setActive(id: string, isActive: boolean, branchId: string) {
    const doc = await this.ingredientModel.findOneAndUpdate(
      { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
      { isActive: Boolean(isActive) },
      { new: true },
    );

    if (!doc) throw new NotFoundException('Ingredient not found');
    return this.toDto(doc);
  }

  // ===========================================================================
  // SET MIN QTY (stock.minQty) (scoped)
  // ===========================================================================
  async setMinQty(id: string, minQty: number, branchId: string) {
    const qty = Math.max(0, Number(minQty) || 0);

    const doc = await this.ingredientModel.findOneAndUpdate(
      { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
      { 'stock.minQty': qty },
      { new: true },
    );

    if (!doc) throw new NotFoundException('Ingredient not found');
    return this.toDto(doc);
  }

  // ===========================================================================
  // SET NAME_FOR_SUPPLIER (scoped)
  // ===========================================================================
  async setNameForSupplier(
    id: string,
    name_for_supplier: string | null,
    branchId: string,
  ) {
    const v = name_for_supplier == null ? null : String(name_for_supplier).trim();

    try {
      const doc = await this.ingredientModel.findOneAndUpdate(
        { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
        { name_for_supplier: v },
        { new: true },
      );
      if (!doc) throw new NotFoundException('Ingredient not found');
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new ConflictException('name_for_supplier already exists');
      }
      throw e;
    }
  }

  // ===========================================================================
  // SET COST (lastCost / avgCost / currency) (scoped)
  // ===========================================================================
  async setCost(
    id: string,
    input: { lastCost?: number; avgCost?: number; currency?: 'ARS' | 'USD' },
    branchId: string,
  ) {
    const update: any = {};

    if (input.lastCost != null)
      update['cost.lastCost'] = Math.max(0, Number(input.lastCost) || 0);

    if (input.avgCost != null)
      update['cost.avgCost'] = Math.max(0, Number(input.avgCost) || 0);

    if (input.currency)
      update['cost.currency'] = input.currency === 'USD' ? 'USD' : 'ARS';

    const doc = await this.ingredientModel.findOneAndUpdate(
      { _id: this.asObjectId(id), branchId: this.asObjectId(branchId) },
      update,
      { new: true },
    );

    if (!doc) throw new NotFoundException('Ingredient not found');
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

      branchId: String(row.branchId),

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

        totalIn: row.stock?.totalIn ?? 0,
        totalOut: row.stock?.totalOut ?? 0,
        lastMovementAt: row.stock?.lastMovementAt ?? null,
        lastRecountAt: row.stock?.lastRecountAt ?? null,
      },

      cost: {
        lastCost: row.cost?.lastCost ?? 0,
        avgCost: row.cost?.avgCost ?? 0,
        currency: row.cost?.currency ?? 'ARS',
      },

      // por si ya lo usás/vas a usar
      suppliers: Array.isArray(row.suppliers) ? row.suppliers : [],
      categoryId: row.categoryId ? String(row.categoryId) : null,

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

  private asObjectId(id: string) {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    return new Types.ObjectId(id);
  }
}
