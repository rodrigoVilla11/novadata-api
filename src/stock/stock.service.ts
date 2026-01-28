import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';

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
  branchId: string; // ✅ NUEVO (viene del JWT en controller)
  dateKey: string; // YYYY-MM-DD
  saleId: string; // ObjectId string
  lines: Array<{ productId: string; qty: number }>;
  note?: string | null;
  userId?: string | null; // auditoría
};

type ApplyManualInput = {
  branchId: string; // ✅ NUEVO
  dateKey: string;
  type: StockMovementType; // IN | OUT | ADJUST | REVERSAL (según tu enum real)
  reason: StockMovementReason; // PURCHASE | MANUAL | WASTE | etc.
  refType?: string | null; // por ej "PURCHASE", "ADJUSTMENT"
  refId?: string | null; // ObjectId string (si querés idempotencia)
  items: ApplyMovementItem[];
  note?: string | null;
  userId?: string | null;
};

type ApplySaleReversalInput = {
  branchId: string; // ✅ NUEVO
  dateKey: string;
  saleId: string; // ObjectId string
  lines: Array<{ productId: string; qty: number }>;
  note?: string | null;
  userId?: string | null;
};

function isValidDateKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type StockAlertRow = {
  productId: string;
  name: string;
  providerId?: string | null;
  providerName?: string | null;
  unit?: string | null;
  qty: number | null;
  minQty: number | null;
  status: 'LOW' | 'NO_COUNT';
};

export type NegativeStockLine = {
  ingredientId: string;
  unit: Unit;
  prevOnHand: number;
  nextOnHand: number;
  delta: number; // negativo (resta)
};

export type ApplySaleResult = {
  ok: boolean;
  created: number;
  items: Array<{ ingredientId: string; unit: Unit; qty: number }>;
  idempotent: boolean;
  negativeLines: NegativeStockLine[];
};

@Injectable()
export class StockService {
  constructor(
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovement>,
    @InjectModel(Ingredient.name)
    private readonly ingredientModel: Model<Ingredient>,
    private readonly recipeService: RecipeService,
    @InjectConnection()
    private readonly conn: Connection,
  ) {}

  private oidOrThrow(id: string, label: string) {
    const s = String(id ?? '').trim();
    if (!s) throw new BadRequestException(`${label} is required`);
    if (!Types.ObjectId.isValid(s))
      throw new BadRequestException(`${label} must be a valid ObjectId`);
    return new Types.ObjectId(s);
  }

  private oidOrNull(id?: string | null, label?: string) {
    const s = String(id ?? '').trim();
    if (!s) return null;
    if (!Types.ObjectId.isValid(s)) {
      throw new BadRequestException(
        `${label ?? 'id'} must be a valid ObjectId`,
      );
    }
    return new Types.ObjectId(s);
  }

  private mkDedupeKey(parts: Array<string | null | undefined>) {
    return parts
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .join(':');
  }

  private assertBranchId(branchId: string) {
    const s = String(branchId ?? '').trim();
    if (!s) throw new BadRequestException('branchId is required');
    if (!Types.ObjectId.isValid(s))
      throw new BadRequestException('branchId must be a valid ObjectId');
    return new Types.ObjectId(s);
  }

  /**
   * Core: aplica UN movimiento por ingrediente (1 item) en transacción:
   * - update Ingredient.stock (por branch)
   * - insert StockMovement con qtyAfter
   *
   * Si dedupeKey ya existe => lanza "Duplicate movement (already applied)"
   * (caller lo trata como idempotente).
   *
   * ✅ Ahora devuelve prev/next para poder detectar stock negativo sin bloquear.
   */
  private async applyOneMovementTx(args: {
    session: any;
    branchId: Types.ObjectId; // ✅
    dateKey: string;
    ingredientId: Types.ObjectId;
    unit: Unit;
    qtyDelta: number; // signed
    type: StockMovementType;
    reason: StockMovementReason;
    refType?: string | null;
    refId?: Types.ObjectId | null;
    note?: string | null;
    createdByUserId?: Types.ObjectId | null;
    dedupeKey?: string | null;
    forbidNegative?: boolean; // default true
  }): Promise<{
    prevOnHand: number;
    nextOnHand: number;
    onHandAfter: number;
  }> {
    const forbidNegative = args.forbidNegative ?? true;

    // 0) leer onHand previo (dentro de la tx)
    const beforeDoc = await this.ingredientModel
      .findOne(
        {
          _id: args.ingredientId,
          branchId: args.branchId,
        } as any,
        { stock: 1 } as any,
      )
      .session(args.session)
      .lean();

    if (!beforeDoc) {
      throw new NotFoundException(
        `Ingredient not found in branch: ingredient=${String(
          args.ingredientId,
        )}`,
      );
    }

    const prevOnHand = num((beforeDoc as any).stock?.onHand);
    const trackStock = !!(beforeDoc as any).stock?.trackStock;

    // 1) update stock actual (✅ por branch)
    const inc: any = { 'stock.onHand': args.qtyDelta };
    if (args.qtyDelta > 0) inc['stock.totalIn'] = args.qtyDelta;
    if (args.qtyDelta < 0) inc['stock.totalOut'] = Math.abs(args.qtyDelta);

    const updated = await this.ingredientModel.findOneAndUpdate(
      {
        _id: args.ingredientId,
        branchId: args.branchId,
      } as any,
      {
        $inc: inc,
        $set: { 'stock.lastMovementAt': new Date() },
      },
      {
        new: true,
        session: args.session,
        projection: { stock: 1, baseUnit: 1 } as any,
      },
    );

    if (!updated)
      throw new NotFoundException(
        `Ingredient not found in branch: ingredient=${String(
          args.ingredientId,
        )}`,
      );

    const onHandAfter = num((updated as any).stock?.onHand);
    const nextOnHand = onHandAfter;

    if (forbidNegative && trackStock && onHandAfter < 0) {
      throw new BadRequestException(
        `Stock negativo no permitido: ingredient=${String(args.ingredientId)} ` +
          `before=${prevOnHand} delta=${args.qtyDelta} after=${onHandAfter} ` +
          `unit=${args.unit} baseUnit=${String((updated as any).baseUnit ?? '')}`,
      );
    }

    // 2) insert movement (✅ con branchId)
    try {
      await this.movementModel.create(
        [
          {
            branchId: args.branchId,
            dateKey: args.dateKey,
            ingredientId: args.ingredientId,
            unit: args.unit,
            type: args.type,
            reason: args.reason,
            refType: args.refType ?? null,
            refId: args.refId ?? null,
            qty: args.qtyDelta,
            qtyAfter: onHandAfter,
            note: args.note ?? null,
            createdByUserId: args.createdByUserId ?? null,
            dedupeKey: args.dedupeKey ?? null,
          } as any,
        ],
        { session: args.session },
      );
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new BadRequestException('Duplicate movement (already applied)');
      }
      throw e;
    }

    return { prevOnHand, nextOnHand, onHandAfter };
  }

  /**
   * Venta => OUT de ingredientes por receta
   * Idempotencia: dedupeKey = SALE:<saleId>:<ingredientId>:<unit>:OUT
   *
   * ✅ Permite stock negativo, pero devuelve negativeLines para avisar.
   */
  async applySale(dto: ApplySaleInput): Promise<ApplySaleResult> {
    assertDateKey(dto.dateKey);

    const branchObjId = this.assertBranchId(dto.branchId);
    const saleObjId = this.oidOrThrow(dto.saleId, 'saleId');
    const userObjId = this.oidOrNull(dto.userId, 'userId');

    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('lines[] is required');
    }

    // Expandir productos -> ingredientes y acumular
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

    const session = await this.conn.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const outItems: Array<{
          ingredientId: string;
          unit: Unit;
          qty: number;
        }> = [];
        const negativeLines: NegativeStockLine[] = [];
        let created = 0;

        for (const it of items) {
          const ingObjId = this.oidOrThrow(it.ingredientId, 'ingredientId');
          const qtyDelta = -Math.abs(num(it.qty));

          const dedupeKey = this.mkDedupeKey([
            'SALE',
            String(saleObjId),
            String(ingObjId),
            it.unit,
            StockMovementType.OUT,
          ]);

          try {
            const bal = await this.applyOneMovementTx({
              session,
              branchId: branchObjId,
              dateKey: dto.dateKey,
              ingredientId: ingObjId,
              unit: it.unit,
              qtyDelta,
              type: StockMovementType.OUT,
              reason: StockMovementReason.SALE,
              refType: 'SALE',
              refId: saleObjId,
              note: dto.note ?? null,
              createdByUserId: userObjId,
              dedupeKey,
              forbidNegative: false, // ✅ PERMITIR NEGATIVO EN VENTA
            });

            created += 1;

            if (Number.isFinite(bal.nextOnHand) && bal.nextOnHand < 0) {
              negativeLines.push({
                ingredientId: String(ingObjId),
                unit: it.unit,
                prevOnHand: num(bal.prevOnHand),
                nextOnHand: num(bal.nextOnHand),
                delta: num(qtyDelta),
              });
            }
          } catch (e: any) {
            const msg = String(e?.message ?? '');
            const code = e?.code;
            const isDup =
              code === 11000 ||
              msg.includes('E11000') ||
              msg.includes('Duplicate movement');
            if (!isDup) throw e;
          }

          outItems.push({
            ingredientId: String(ingObjId),
            unit: it.unit,
            qty: Math.abs(qtyDelta),
          });
        }

        return { created, outItems, negativeLines };
      });

      return {
        ok: true,
        created: result?.created ?? 0,
        items: result?.outItems ?? [],
        idempotent: (result?.created ?? 0) === 0,
        negativeLines: result?.negativeLines ?? [],
      };
    } finally {
      session.endSession();
    }
  }

  /**
   * Manual (compras/merma/ajuste/etc.)
   * (por default: forbidNegative=true)
   */
  async applyManual(input: ApplyManualInput) {
    assertDateKey(input.dateKey);

    const branchObjId = this.assertBranchId(input.branchId);

    if (!input.type) throw new BadRequestException('type is required');
    if (!input.reason) throw new BadRequestException('reason is required');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException('items[] is required');
    }

    const refType = input.refType ? String(input.refType).trim() : null;
    const refObjId = this.oidOrNull(input.refId, 'refId');
    const userObjId = this.oidOrNull(input.userId, 'userId');

    // Resolver baseUnit si falta unit (✅ por branch)
    const ids = input.items
      .map((x) => String(x.ingredientId || '').trim())
      .filter(Boolean);

    const ingredientDocs = await this.ingredientModel
      .find({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        branchId: branchObjId,
      } as any)
      .select({ baseUnit: 1 })
      .lean();

    const ingById = new Map<string, any>();
    for (const d of ingredientDocs as any[]) ingById.set(String(d._id), d);

    const session = await this.conn.startSession();
    try {
      const res = await session.withTransaction(async () => {
        let created = 0;

        for (const it of input.items) {
          const ingredientIdStr = String(it.ingredientId || '').trim();
          if (!ingredientIdStr)
            throw new BadRequestException('ingredientId is required');

          const ing = ingById.get(ingredientIdStr);
          if (!ing)
            throw new NotFoundException(
              `Ingredient not found in branch: ${ingredientIdStr}`,
            );

          const ingObjId = new Types.ObjectId(ingredientIdStr);
          const unit = (it.unit ?? ing.baseUnit ?? Unit.UNIT) as Unit;

          let qtyDelta = 0;

          if (input.type === StockMovementType.ADJUST) {
            const signed = num(it.qty);
            if (!Number.isFinite(signed) || signed === 0) {
              throw new BadRequestException(
                'For ADJUST, qty must be a signed non-zero number',
              );
            }
            qtyDelta = signed;
          } else {
            const qtyAbs = Math.abs(num(it.qty));
            if (!Number.isFinite(qtyAbs) || qtyAbs <= 0)
              throw new BadRequestException('qty must be > 0');
            qtyDelta = input.type === StockMovementType.OUT ? -qtyAbs : +qtyAbs;
          }

          const hasDedupe = !!(refType && refObjId);
          const dedupeKey = hasDedupe
            ? this.mkDedupeKey([
                refType!,
                String(refObjId),
                String(ingObjId),
                unit,
                input.type,
              ])
            : null;

          await this.applyOneMovementTx({
            session,
            branchId: branchObjId,
            dateKey: input.dateKey,
            ingredientId: ingObjId,
            unit,
            qtyDelta,
            type: input.type,
            reason: input.reason,
            refType,
            refId: refObjId,
            note: it.note ?? input.note ?? null,
            createdByUserId: userObjId,
            dedupeKey,
            // forbidNegative: true (default)
          });

          created += 1;
        }

        return created;
      });

      return { ok: true, created: res ?? 0 };
    } finally {
      session.endSession();
    }
  }

  /**
   * Reversa de venta: REVERSAL qty +
   */
  async applySaleReversal(dto: ApplySaleReversalInput) {
    assertDateKey(dto.dateKey);

    const branchObjId = this.assertBranchId(dto.branchId);
    const saleObjId = this.oidOrThrow(dto.saleId, 'saleId');
    const userObjId = this.oidOrNull(dto.userId, 'userId');

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

    if (!items.length) {
      throw new BadRequestException('No ingredient restore computed');
    }

    const session = await this.conn.startSession();
    try {
      const created = await session.withTransaction(async () => {
        let count = 0;

        for (const it of items) {
          const ingObjId = this.oidOrThrow(it.ingredientId, 'ingredientId');
          const qtyDelta = +Math.abs(num(it.qty));

          const dedupeKey = this.mkDedupeKey([
            'SALE',
            String(saleObjId),
            String(ingObjId),
            it.unit,
            StockMovementType.REVERSAL,
          ]);

          await this.applyOneMovementTx({
            session,
            branchId: branchObjId,
            dateKey: dto.dateKey,
            ingredientId: ingObjId,
            unit: it.unit,
            qtyDelta,
            type: StockMovementType.REVERSAL,
            reason: StockMovementReason.SALE,
            refType: 'SALE',
            refId: saleObjId,
            note: dto.note ?? null,
            createdByUserId: userObjId,
            dedupeKey,
            // forbidNegative: true (default) (reversa suma, no debería negativizar)
          });

          count += 1;
        }

        return count;
      });

      return { ok: true, created: created ?? 0 };
    } finally {
      session.endSession();
    }
  }

  /**
   * Balance actual (rápido): usa Ingredient.stock.onHand
   */
  async getBalances(params: {
    branchId: string;
    ingredientId?: string | null;
  }) {
    const branchObjId = this.assertBranchId(params.branchId);

    const filter: any = { branchId: branchObjId };
    if (params?.ingredientId)
      filter._id = new Types.ObjectId(params.ingredientId);

    const rows = await this.ingredientModel
      .find(filter)
      .select({ name: 1, displayName: 1, baseUnit: 1, stock: 1 })
      .lean();

    return rows.map((r: any) => ({
      ingredientId: String(r._id),
      ingredientName: String(r.displayName ?? r.name ?? ''),
      unit: r.baseUnit,
      qty: num(r.stock?.onHand),
      reserved: num(r.stock?.reserved),
      totalIn: num(r.stock?.totalIn),
      totalOut: num(r.stock?.totalOut),
      lastAt: r.stock?.lastMovementAt ?? null,
    }));
  }

  /**
   * Movimientos (auditoría)
   */
  async listMovements(params: {
    branchId: string;
    dateKey?: string;
    ingredientId?: string | null;
    refType?: string | null;
    refId?: string | null;
    limit?: number;
  }) {
    const branchObjId = this.assertBranchId(params.branchId);

    const filter: any = { branchId: branchObjId };

    if (params?.dateKey) {
      assertDateKey(params.dateKey);
      filter.dateKey = params.dateKey;
    }
    if (params?.ingredientId)
      filter.ingredientId = new Types.ObjectId(params.ingredientId);
    if (params?.refType) filter.refType = String(params.refType);
    if (params?.refId) filter.refId = new Types.ObjectId(params.refId);

    const limit = Math.min(500, Math.max(1, Number(params?.limit ?? 100)));

    const rows = await this.movementModel
      .find(filter)
      .populate({ path: 'ingredientId', select: 'name displayName baseUnit' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return rows.map((m: any) => {
      const ing =
        m.ingredientId && typeof m.ingredientId === 'object'
          ? m.ingredientId
          : null;

      return {
        id: String(m._id),
        branchId: m.branchId ? String(m.branchId) : null,
        dateKey: m.dateKey,
        type: m.type,
        reason: m.reason,
        refType: m.refType ?? null,
        refId: m.refId ? String(m.refId) : null,

        ingredientId: ing
          ? String(ing._id)
          : m.ingredientId
            ? String(m.ingredientId)
            : null,
        ingredientName: ing ? String(ing.displayName ?? ing.name ?? '') : null,
        unit: m.unit,

        qty: num(m.qty),
        qtyAfter: m.qtyAfter ?? null,
        note: m.note ?? null,
        createdByUserId: m.createdByUserId ? String(m.createdByUserId) : null,
        createdAt: m.createdAt,
        dedupeKey: m.dedupeKey ?? null,
      };
    });
  }

  /**
   * Recibir compra (helper)
   */
  async applyPurchaseReceiveTx(input: {
    session: any;
    branchId: Types.ObjectId; // ✅
    dateKey: string;
    purchaseOrderId: Types.ObjectId;
    ingredientId: Types.ObjectId;
    unit: Unit;
    qty: number; // +qty
    note?: string | null;
    createdByUserId?: Types.ObjectId | null;
  }) {
    const dedupeKey = this.mkDedupeKey([
      'PURCHASE',
      String(input.purchaseOrderId),
      String(input.ingredientId),
      input.unit,
      StockMovementType.IN,
    ]);

    await this.applyOneMovementTx({
      session: input.session,
      branchId: input.branchId,
      dateKey: input.dateKey,
      ingredientId: input.ingredientId,
      unit: input.unit,
      qtyDelta: Math.abs(input.qty),
      type: StockMovementType.IN,
      reason: StockMovementReason.PURCHASE,
      refType: 'PURCHASE',
      refId: input.purchaseOrderId,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId ?? null,
      dedupeKey,
    });
  }

  async getAlerts(args: { branchId: string; dateKey?: string }) {
    const { branchId, dateKey } = args;

    if (dateKey && !isValidDateKey(dateKey)) {
      throw new BadRequestException('dateKey inválido (YYYY-MM-DD)');
    }

    const rows = await this.ingredientModel
      .find(
        {
          branchId: new Types.ObjectId(branchId),
          isActive: true,
          'stock.trackStock': true,
          deletedAt: { $exists: false },
        },
        {
          name: 1,
          displayName: 1,
          baseUnit: 1,
          supplierId: 1,
          stock: 1,
        },
      )
      .populate({ path: 'supplierId', select: 'name' })
      .lean();

    const out: StockAlertRow[] = [];

    for (const ing of rows as any[]) {
      const onHand = ing?.stock?.onHand;
      const minQty = ing?.stock?.minQty;

      const noCount =
        onHand === null || onHand === undefined || Number.isNaN(Number(onHand));

      const low =
        !noCount &&
        minQty !== null &&
        minQty !== undefined &&
        !Number.isNaN(Number(minQty)) &&
        Number(onHand) < Number(minQty);

      if (!noCount && !low) continue;

      out.push({
        productId: String(ing._id),
        name: ing.displayName || ing.name || '—',
        providerId: ing?.supplierId?._id ? String(ing.supplierId._id) : null,
        providerName: ing?.supplierId?.name ?? null,
        unit: ing?.baseUnit ?? null,
        qty: noCount ? null : Number(onHand),
        minQty:
          minQty === null ||
          minQty === undefined ||
          Number.isNaN(Number(minQty))
            ? null
            : Number(minQty),
        status: noCount ? 'NO_COUNT' : 'LOW',
      });
    }

    return out;
  }
}
