import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Ingredient } from 'src/ingredients/schemas/ingredients.schema';
import { Unit } from 'src/ingredients/enums/unit.enum';

import { RecipeService } from 'src/recipes/recipe.service';
import { StockMovement } from './schemas/stock-movement.schema';
import { StockMovementReason, StockMovementType } from './enums/stock.enums';

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clampNonNeg(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function assertDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) {
    throw new BadRequestException('dateKey must be YYYY-MM-DD');
  }
}

type ApplyMovementItem = {
  ingredientId: string;
  qty: number; // IN/OUT: positivo (service firma el signo). ADJUST: signed no-cero
  unit?: Unit | null; // opcional: si no viene, se obtiene del ingrediente
  note?: string | null;
};

type ApplySaleInput = {
  dateKey: string; // YYYY-MM-DD
  saleId: string; // id de la venta (ref)
  lines: Array<{ productId: string; qty: number }>;
  note?: string | null;
  userId?: string | null; // auditoría
};

type ApplyManualInput = {
  dateKey: string;

  type: StockMovementType; // IN | OUT | ADJUST
  reason: StockMovementReason; // PURCHASE | MANUAL | WASTE | etc.

  refType?: string | null; // por ej "PURCHASE", "ADJUSTMENT"
  refId?: string | null;

  items: ApplyMovementItem[];
  note?: string | null;
  userId?: string | null;
};

type ApplySaleVoidInput = {
  dateKey: string;
  saleId: string;
  lines: Array<{ productId: string; qty: number }>;
  note?: string | null;
  userId?: string | null;
};

@Injectable()
export class StockService {
  constructor(
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovement>,
    @InjectModel(Ingredient.name)
    private readonly ingredientModel: Model<Ingredient>,
    private readonly recipeService: RecipeService,
  ) {}

  /**
   * Aplica una venta (productos) => genera movimientos OUT de ingredientes automáticamente
   * Controller manda: { dateKey, saleId, lines, note?, userId? }
   */
  async applySale(dto: ApplySaleInput) {
    assertDateKey(dto.dateKey);

    if (!dto.saleId?.trim())
      throw new BadRequestException('saleId is required');
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('lines[] is required');
    }

    // Por ahora NO usamos branchId
    const branchId = null;

    // 1) Expandir cada producto a ingredientes y acumular
    const acc = new Map<
      string,
      { ingredientId: string; unit: Unit; qty: number }
    >();

    for (const line of dto.lines) {
      const productId = String(line.productId || '').trim();
      const qty = num(line.qty);

      if (!productId)
        throw new BadRequestException('line.productId is required');
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException('line.qty must be > 0');
      }

      const expanded = await this.recipeService.expandProductToIngredients(
        productId,
        qty,
      );

      for (const it of expanded.items) {
        const key = `${it.ingredientId}::${it.unit}`;
        const prev = acc.get(key);
        if (!prev) {
          acc.set(key, {
            ingredientId: it.ingredientId,
            unit: it.unit,
            qty: it.qty,
          });
        } else {
          prev.qty += it.qty;
        }
      }
    }

    const items = Array.from(acc.values())
      .map((x) => ({ ...x, qty: clampNonNeg(x.qty) }))
      .filter((x) => x.qty > 0);

    if (!items.length) {
      throw new BadRequestException(
        'No ingredient consumption computed from sale',
      );
    }

    // 2) Crear movimientos OUT (qty negativo)
    const docs = items.map((it) => ({
      dateKey: dto.dateKey,
      branchId,
      type: StockMovementType.OUT,
      reason: StockMovementReason.SALE,
      refType: 'SALE',
      refId: dto.saleId,
      ingredientId: new Types.ObjectId(it.ingredientId),
      unit: it.unit,
      qty: -Math.abs(num(it.qty)),
      note: dto.note ?? null,
      userId: dto.userId ? String(dto.userId) : null,
    }));

    await this.movementModel.insertMany(docs);

    return {
      ok: true,
      created: docs.length,
      items: items.map((x) => ({
        ingredientId: x.ingredientId,
        unit: x.unit,
        qty: x.qty, // positivo en respuesta (consumo)
      })),
    };
  }

  /**
   * Aplica movimiento manual (compras, ajustes, merma, etc.)
   * - IN => qty positivo
   * - OUT => qty negativo
   * - ADJUST => qty signed (≠ 0)
   */
  async applyManual(input: ApplyManualInput) {
    assertDateKey(input.dateKey);

    if (!input.type) throw new BadRequestException('type is required');
    if (!input.reason) throw new BadRequestException('reason is required');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException('items[] is required');
    }

    // Por ahora NO usamos branchId
    const branchId = null;

    // Si no viene unit, la sacamos del ingrediente
    const ids = input.items.map((x) => x.ingredientId).filter(Boolean);
    const ingredientDocs = await this.ingredientModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select({ unit: 1, baseUnit: 1 })
      .lean();

    const ingById = new Map<string, any>();
    for (const d of ingredientDocs as any[]) ingById.set(String(d._id), d);

    const docs = input.items.map((it) => {
      const ingredientId = String(it.ingredientId || '').trim();
      if (!ingredientId)
        throw new BadRequestException('ingredientId is required');

      const ing = ingById.get(ingredientId);
      if (!ing)
        throw new NotFoundException(`Ingredient not found: ${ingredientId}`);

      const unit = (it.unit ?? ing.baseUnit ?? ing.unit ?? Unit.UNIT) as Unit;

      if (input.type === StockMovementType.ADJUST) {
        const signed = num(it.qty);
        if (!Number.isFinite(signed) || signed === 0) {
          throw new BadRequestException(
            'For ADJUST, qty must be a signed non-zero number',
          );
        }

        return {
          dateKey: input.dateKey,
          branchId,
          type: input.type,
          reason: input.reason,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
          ingredientId: new Types.ObjectId(ingredientId),
          unit,
          qty: signed,
          note: it.note ?? input.note ?? null,
          userId: input.userId ? String(input.userId) : null,
        };
      }

      const qtyAbs = Math.abs(num(it.qty));
      if (!Number.isFinite(qtyAbs) || qtyAbs <= 0) {
        throw new BadRequestException('qty must be > 0');
      }

      const qtySigned =
        input.type === StockMovementType.OUT ? -qtyAbs : +qtyAbs;

      return {
        dateKey: input.dateKey,
        branchId,
        type: input.type,
        reason: input.reason,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        ingredientId: new Types.ObjectId(ingredientId),
        unit,
        qty: qtySigned,
        note: it.note ?? input.note ?? null,
        userId: input.userId ? String(input.userId) : null,
      };
    });

    await this.movementModel.insertMany(docs);
    return { ok: true, created: docs.length };
  }

  /**
   * Balance actual por ingrediente (sumando movimientos)
   * Sin branchId por ahora.
   */
  async getBalances(params?: { ingredientId?: string | null }) {
    const match: any = { branchId: null };

    if (params?.ingredientId) {
      match.ingredientId = new Types.ObjectId(params.ingredientId);
    }

    const agg = await this.movementModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { ingredientId: '$ingredientId', unit: '$unit' },
          qty: { $sum: '$qty' },
          lastAt: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 0,
          ingredientId: { $toString: '$_id.ingredientId' },
          unit: '$_id.unit',
          qty: 1,
          lastAt: 1,
        },
      },
      { $sort: { ingredientId: 1 } },
    ]);

    return agg.map((x: any) => ({
      ingredientId: x.ingredientId,
      unit: x.unit,
      qty: num(x.qty),
      lastAt: x.lastAt ?? null,
    }));
  }

  /**
   * Movimientos (auditoría)
   * Sin branchId por ahora.
   */
  async listMovements(params?: {
    dateKey?: string;
    ingredientId?: string | null;
    refType?: string | null;
    refId?: string | null;
    limit?: number;
  }) {
    const filter: any = { branchId: null };

    if (params?.dateKey) {
      assertDateKey(params.dateKey);
      filter.dateKey = params.dateKey;
    }

    if (params?.ingredientId)
      filter.ingredientId = new Types.ObjectId(params.ingredientId);
    if (params?.refType) filter.refType = String(params.refType);
    if (params?.refId) filter.refId = String(params.refId);

    const limit = Math.min(500, Math.max(1, Number(params?.limit ?? 100)));

    const rows = await this.movementModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return rows.map((m: any) => ({
      id: String(m._id),
      dateKey: m.dateKey,
      branchId: null,
      type: m.type,
      reason: m.reason,
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      ingredientId: m.ingredientId ? String(m.ingredientId) : null,
      unit: m.unit,
      qty: num(m.qty),
      note: m.note ?? null,
      userId: m.userId ?? null,
      createdAt: m.createdAt,
    }));
  }

  async applySaleReversal(dto: {
    dateKey: string;
    saleId: string;
    lines: Array<{ productId: string; qty: number }>;
    note?: string | null;
    userId?: string | null;
  }) {
    assertDateKey(dto.dateKey);
    if (!dto.saleId?.trim())
      throw new BadRequestException('saleId is required');
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('lines[] is required');
    }

    const acc = new Map<
      string,
      { ingredientId: string; unit: Unit; qty: number }
    >();

    for (const line of dto.lines) {
      const productId = String(line.productId || '').trim();
      const qty = num(line.qty);
      if (!productId)
        throw new BadRequestException('line.productId is required');
      if (!Number.isFinite(qty) || qty <= 0)
        throw new BadRequestException('line.qty must be > 0');

      const expanded = await this.recipeService.expandProductToIngredients(
        productId,
        qty,
      );

      for (const it of expanded.items) {
        const key = `${it.ingredientId}::${it.unit}`;
        const prev = acc.get(key);
        if (!prev)
          acc.set(key, {
            ingredientId: it.ingredientId,
            unit: it.unit,
            qty: it.qty,
          });
        else prev.qty += it.qty;
      }
    }

    const items = Array.from(acc.values())
      .map((x) => ({ ...x, qty: clampNonNeg(x.qty) }))
      .filter((x) => x.qty > 0);

    if (!items.length)
      throw new BadRequestException('No ingredient restore computed');

    const docs = items.map((it) => ({
      dateKey: dto.dateKey,
      type: StockMovementType.REVERSAL,
      reason: StockMovementReason.SALE,
      refType: 'SALE',
      refId: dto.saleId,

      ingredientId: new Types.ObjectId(it.ingredientId),
      unit: it.unit,

      // REVERSAL del OUT => qty positivo
      qty: +Math.abs(num(it.qty)),

      note: dto.note ?? null,
      createdByUserId: dto.userId ? String(dto.userId) : null,
    }));

    await this.movementModel.insertMany(docs);

    return { ok: true, created: docs.length };
  }
}
