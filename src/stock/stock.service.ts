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
import {
  StockMovement,
} from './schemas/stock-movement.schema';
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
  // simple yyyy-mm-dd
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) {
    throw new BadRequestException('dateKey must be YYYY-MM-DD');
  }
}

type ApplyMovementItem = {
  ingredientId: string;
  qty: number; // siempre positivo en el input; el service define el signo según type
  unit?: Unit | null; // opcional: si no viene, lo obtiene del ingredient
  note?: string | null;
};

type ApplySaleInput = {
  dateKey: string; // YYYY-MM-DD
  branchId?: string | null;
  saleId: string; // id de la venta (ref)
  lines: Array<{ productId: string; qty: number }>;
  note?: string | null;
  userId?: string | null; // para auditoría
};

type ApplyManualInput = {
  dateKey: string;
  branchId?: string | null;

  type: StockMovementType; // IN | OUT | ADJUST
  reason: StockMovementReason; // PURCHASE | MANUAL | WASTE | etc.

  refType?: string | null; // por ej "PURCHASE", "ADJUSTMENT"
  refId?: string | null;

  items: ApplyMovementItem[];
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
   */
  async applySale(input: ApplySaleInput) {
    assertDateKey(input.dateKey);

    if (!input.saleId?.trim()) throw new BadRequestException('saleId is required');
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new BadRequestException('lines[] is required');
    }

    const branchId = input.branchId ? new Types.ObjectId(input.branchId) : null;

    // 1) Expandir cada producto a ingredientes y acumular
    const acc = new Map<string, { ingredientId: string; unit: Unit; qty: number }>();

    for (const line of input.lines) {
      const productId = String(line.productId || '').trim();
      const qty = num(line.qty);

      if (!productId) throw new BadRequestException('line.productId is required');
      if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('line.qty must be > 0');

      const expanded = await this.recipeService.expandProductToIngredients(productId, qty);

      for (const it of expanded.items) {
        const key = `${it.ingredientId}::${it.unit}`;
        const prev = acc.get(key);
        if (!prev) acc.set(key, { ingredientId: it.ingredientId, unit: it.unit, qty: it.qty });
        else prev.qty += it.qty;
      }
    }

    const items = Array.from(acc.values())
      .map((x) => ({ ...x, qty: clampNonNeg(x.qty) }))
      .filter((x) => x.qty > 0);

    if (!items.length) {
      // receta vacía => no debería pasar si validaste products
      throw new BadRequestException('No ingredient consumption computed from sale');
    }

    // 2) Crear movimientos OUT
    const docs = items.map((it) => ({
      dateKey: input.dateKey,
      branchId,
      type: StockMovementType.OUT,
      reason: StockMovementReason.SALE,
      refType: 'SALE',
      refId: input.saleId,
      ingredientId: new Types.ObjectId(it.ingredientId),
      unit: it.unit,
      qty: -Math.abs(num(it.qty)), // OUT negativo
      note: input.note ?? null,
      userId: input.userId ? String(input.userId) : null,
    }));

    await this.movementModel.insertMany(docs);

    return {
      ok: true,
      created: docs.length,
      items: items.map((x) => ({
        ingredientId: x.ingredientId,
        unit: x.unit,
        qty: x.qty,
      })),
    };
  }

  /**
   * Aplica movimiento manual (compras, ajustes, merma, etc.)
   * - IN => qty positivo
   * - OUT => qty negativo
   * - ADJUST => qty puede ser + o - (pero normalmente lo mandás con signo)
   */
  async applyManual(input: ApplyManualInput) {
    assertDateKey(input.dateKey);

    if (!input.type) throw new BadRequestException('type is required');
    if (!input.reason) throw new BadRequestException('reason is required');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException('items[] is required');
    }

    const branchId = input.branchId ? new Types.ObjectId(input.branchId) : null;

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
      if (!ingredientId) throw new BadRequestException('ingredientId is required');

      const qtyAbs = Math.abs(num(it.qty));
      if (!Number.isFinite(qtyAbs) || qtyAbs <= 0) {
        throw new BadRequestException('qty must be > 0');
      }

      const ing = ingById.get(ingredientId);
      if (!ing) throw new NotFoundException(`Ingredient not found: ${ingredientId}`);

      const unit = (it.unit ?? ing.baseUnit ?? ing.unit ?? Unit.UNIT) as Unit;

      let qtySigned = qtyAbs;

      if (input.type === StockMovementType.OUT) qtySigned = -qtyAbs;
      if (input.type === StockMovementType.IN) qtySigned = +qtyAbs;

      // ADJUST: por defecto respetamos signo si el usuario mandó negativo en it.qty
      if (input.type === StockMovementType.ADJUST) {
        const raw = num(it.qty);
        qtySigned = raw === 0 ? 0 : raw; // permite + o -
        if (!Number.isFinite(qtySigned) || qtySigned === 0) {
          // para ADJUST, forzá a que venga con signo y distinto de 0
          throw new BadRequestException('For ADJUST, qty must be a signed non-zero number');
        }
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
        qty: qtySigned,
        note: it.note ?? input.note ?? null,
        userId: input.userId ? String(input.userId) : null,
      };
    });

    await this.movementModel.insertMany(docs);

    return { ok: true, created: docs.length };
  }

  /**
   * Balance “actual” por ingrediente (sumando movimientos).
   * Si pasás ingredientId => devuelve uno.
   * Si no => devuelve listado.
   */
  async getBalances(params?: {
    branchId?: string | null;
    ingredientId?: string | null;
  }) {
    const match: any = {};

    if (params?.branchId) match.branchId = new Types.ObjectId(params.branchId);
    else match.branchId = null; // si usás branch único como null (ajustalo si querés multi-branch)

    if (params?.ingredientId) match.ingredientId = new Types.ObjectId(params.ingredientId);

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
   * Movimientos (para auditoría)
   */
  async listMovements(params?: {
    dateKey?: string;
    branchId?: string | null;
    ingredientId?: string | null;
    refType?: string | null;
    refId?: string | null;
    limit?: number;
  }) {
    const filter: any = {};

    if (params?.dateKey) {
      assertDateKey(params.dateKey);
      filter.dateKey = params.dateKey;
    }

    if (params?.branchId) filter.branchId = new Types.ObjectId(params.branchId);
    else filter.branchId = null;

    if (params?.ingredientId) filter.ingredientId = new Types.ObjectId(params.ingredientId);
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
      branchId: m.branchId ? String(m.branchId) : null,
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
}
