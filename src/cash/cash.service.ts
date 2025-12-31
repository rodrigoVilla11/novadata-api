import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { CashDay, CashDayDocument, CashDayStatus } from "./schemas/cash-day.schema";
import {
  CashMovement,
  CashMovementDocument,
  CashMovementType,
  PaymentMethod,
} from "./schemas/cash-movement.schema";

import { OpenCashDayDto } from "./dto/open-cash-day.dto";
import { CloseCashDayDto } from "./dto/close-cash-day.dto";
import { CreateMovementDto } from "./dto/create-movement.dto";

// 🔑 FINANCE
import {
  FinanceMovement,
  FinanceMovementDocument,
  FinanceMovementType as FinType,
  FinanceMovementDirection as FinDir,
} from "../finance/movements/schemas/finance-movement.schema";

import { FinanceDayClosing, FinanceDayClosingDocument } from "../finance/closings/schemas/finance-day-closing.schema";
import { FinanceAccountsService } from "../finance/accounts/finance-accounts.service";

function pickUserId(u: any) {
  return String(u?.id ?? u?._id ?? u?.userId ?? "");
}
function hasRole(u: any, role: string) {
  const roles = (u?.roles ?? []).map((r: any) => String(r).toUpperCase());
  return roles.includes(String(role).toUpperCase());
}
function toMoney(n: any) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function assertDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "").trim())) {
    throw new BadRequestException("dateKey must be YYYY-MM-DD");
  }
}
function oid(id: string, field: string) {
  if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`${field} inválido`);
  return new Types.ObjectId(id);
}

@Injectable()
export class CashService {
  constructor(
    @InjectModel(CashDay.name)
    private readonly cashDayModel: Model<CashDayDocument>,
    @InjectModel(CashMovement.name)
    private readonly movModel: Model<CashMovementDocument>,

    // ✅ sync con FINANCE
    @InjectModel(FinanceMovement.name)
    private readonly finMovModel: Model<FinanceMovementDocument>,

    @InjectModel(FinanceDayClosing.name)
    private readonly finClosingModel: Model<FinanceDayClosingDocument>,

    private readonly accountsService: FinanceAccountsService,
  ) {}

  // ============================
  // Public mappers
  // ============================

  private toCashDayPublic(d: any) {
    return {
      id: String(d._id),
      dateKey: d.dateKey,
      branchId: d.branchId ? String(d.branchId) : null,
      status: d.status,
      openingCash: toMoney(d.openingCash),
      openedAt: d.openedAt ?? null,
      openedByUserId: d.openedByUserId ?? null,
      expectedCash: toMoney(d.expectedCash),
      countedCash: d.countedCash ?? null,
      diffCash: toMoney(d.diffCash),
      closedAt: d.closedAt ?? null,
      closedByUserId: d.closedByUserId ?? null,
      closeNote: d.closeNote ?? "",
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  private toMovPublic(m: any) {
    return {
      id: String(m._id),
      cashDayId: String(m.cashDayId),
      type: m.type,
      method: m.method,
      amount: toMoney(m.amount),
      categoryId: m.categoryId ? String(m.categoryId) : null,
      concept: m.concept ?? "",
      note: m.note ?? "",
      voided: !!m.voided,
      voidedAt: m.voidedAt ?? null,
      voidedByUserId: m.voidedByUserId ?? null,
      voidReason: m.voidReason ?? "",
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  // ============================
  // Reglas / helpers FINANCE
  // ============================

  /**
   * Elegimos a qué FinanceAccount impacta cada método.
   * Lo correcto es que lo configures en DB, pero para arrancar:
   * - CASH => cuenta tipo CASH llamada "Efectivo" (o "Caja")
   * - TRANSFER => BANK/WALLET "Mercado Pago"/"Banco"
   *
   * ✅ Mejora clave: centralizarlo acá.
   */
  private async resolveFinanceAccountIdForMethod(method: PaymentMethod) {
    const accounts = await this.accountsService.findAll({
      active: true,
      includeDeleted: false,
    } as any);

    const byName = (name: string) =>
      accounts.find((a: any) => String(a.name || "").toLowerCase() === name.toLowerCase());

    // Ajustá estos nombres a los tuyos:
    if (method === PaymentMethod.CASH) {
      return (byName("Efectivo") ?? byName("Caja") ?? accounts[0])?.id;
    }
    if (method === PaymentMethod.TRANSFER) {
      return (byName("Mercado Pago") ?? byName("Banco") ?? accounts[0])?.id;
    }
    if (method === PaymentMethod.CARD) {
      return (byName("Tarjetas") ?? byName("Banco") ?? accounts[0])?.id;
    }
    return (byName("Otros") ?? accounts[0])?.id;
  }

  /**
   * Si el día está LOCKED en finance/closings, bloqueamos CASH también,
   * excepto ADMIN.
   */
  private async assertFinanceDayNotLocked(dateKey: string, user: any) {
    const closing = await this.finClosingModel.findOne({ dateKey }).lean();
    if (!closing) return;
    if (closing.status === "LOCKED" && !hasRole(user, "ADMIN")) {
      throw new BadRequestException(
        `El día ${dateKey} está LOCKED en FINANCE. Solo ADMIN puede modificar caja.`,
      );
    }
  }

  // ============================
  // Day
  // ============================

  async getDayByDateKey(dateKey: string, branchId?: string) {
    assertDateKey(dateKey);
    const bId = branchId ? oid(branchId, "branchId") : null;

    const day = await this.cashDayModel.findOne({ dateKey, branchId: bId }).lean();
    if (!day) return null;

    const rec = await this.recalcExpectedCash(String(day._id));
    return this.toCashDayPublic(rec);
  }

  async getOrCreateDay(user: any, dateKey: string, branchId?: string) {
    assertDateKey(dateKey);
    await this.assertFinanceDayNotLocked(dateKey, user);

    const bId = branchId ? oid(branchId, "branchId") : null;

    const doc = await this.cashDayModel
      .findOneAndUpdate(
        { dateKey, branchId: bId },
        {
          $setOnInsert: {
            dateKey,
            branchId: bId,
            status: CashDayStatus.OPEN,
            openingCash: 0,
            expectedCash: 0,
            diffCash: 0,
            openedAt: new Date(),
            openedByUserId: pickUserId(user),
          },
        },
        { upsert: true, new: true },
      )
      .lean();

    const updated = await this.recalcExpectedCash(String(doc._id));
    return this.toCashDayPublic(updated);
  }

  async openDay(user: any, dto: OpenCashDayDto) {
    assertDateKey(dto.dateKey);
    await this.assertFinanceDayNotLocked(dto.dateKey, user);

    const bId = dto.branchId ? oid(dto.branchId, "branchId") : null;

    const existing = await this.cashDayModel.findOne({ dateKey: dto.dateKey, branchId: bId });

    const openingCash = Math.max(0, toMoney(dto.openingCash));

    if (existing) {
      if (existing.status === CashDayStatus.CLOSED) {
        throw new BadRequestException("La caja de ese día ya está cerrada.");
      }

      const updated = await this.cashDayModel
        .findByIdAndUpdate(
          existing._id,
          {
            openingCash,
            openedAt: existing.openedAt ?? new Date(),
            openedByUserId: existing.openedByUserId ?? pickUserId(user),
          },
          { new: true },
        )
        .lean();

      const rec = await this.recalcExpectedCash(String(updated!._id));
      return this.toCashDayPublic(rec);
    }

    const doc = await this.cashDayModel.create({
      dateKey: dto.dateKey,
      branchId: bId,
      status: CashDayStatus.OPEN,
      openingCash,
      openedAt: new Date(),
      openedByUserId: pickUserId(user),
      expectedCash: 0,
      diffCash: 0,
    });

    const rec = await this.recalcExpectedCash(String((doc as any)._id));
    return this.toCashDayPublic(rec);
  }

  async closeDay(user: any, dto: CloseCashDayDto) {
    assertDateKey(dto.dateKey);

    const userId = pickUserId(user);
    const isAdmin = hasRole(user, "ADMIN");

    await this.assertFinanceDayNotLocked(dto.dateKey, user);

    const bId = dto.branchId ? oid(dto.branchId, "branchId") : null;
    const day = await this.cashDayModel.findOne({ dateKey: dto.dateKey, branchId: bId });
    if (!day) throw new NotFoundException("Caja del día no encontrada.");

    if (day.status === CashDayStatus.CLOSED) {
      if (!isAdmin) throw new BadRequestException("La caja ya está cerrada.");
      // admin puede re-cerrar
    }

    const rec = await this.recalcExpectedCash(String(day._id));
    const expectedCash = toMoney(rec.expectedCash);

    const countedCash =
      dto.countedCash === undefined || dto.countedCash === null
        ? null
        : Math.max(0, toMoney(dto.countedCash));

    const wantsOverride = !!dto.adminOverride;
    if ((countedCash === null || countedCash === 0) && !wantsOverride) {
      throw new BadRequestException("Falta countedCash para cerrar. (o usar adminOverride)");
    }
    if (wantsOverride && !isAdmin) {
      throw new ForbiddenException("Solo ADMIN puede usar adminOverride.");
    }

    const diffCash = countedCash == null ? 0 : countedCash - expectedCash;

    const updated = await this.cashDayModel
      .findByIdAndUpdate(
        rec._id,
        {
          status: CashDayStatus.CLOSED,
          expectedCash,
          countedCash,
          diffCash,
          closedAt: new Date(),
          closedByUserId: userId,
          closeNote: (dto.note ?? "").trim(),
        },
        { new: true },
      )
      .lean();

    return this.toCashDayPublic(updated);
  }

  async reopenDay(user: any, dateKey: string, branchId?: string, note?: string) {
    assertDateKey(dateKey);
    if (!hasRole(user, "ADMIN")) throw new ForbiddenException("Solo ADMIN puede reabrir caja.");

    const bId = branchId ? oid(branchId, "branchId") : null;
    const day = await this.cashDayModel.findOne({ dateKey, branchId: bId });
    if (!day) throw new NotFoundException("Caja del día no encontrada.");

    const updated = await this.cashDayModel
      .findByIdAndUpdate(
        day._id,
        {
          status: CashDayStatus.OPEN,
          closedAt: null,
          closedByUserId: null,
          countedCash: null,
          diffCash: 0,
          closeNote: (note ?? "").trim(),
        },
        { new: true },
      )
      .lean();

    const rec = await this.recalcExpectedCash(String(updated!._id));
    return this.toCashDayPublic(rec);
  }

  // ============================
  // Movements
  // ============================

  async listMovements(cashDayId: string) {
    const rows = await this.movModel
      .find({ cashDayId: oid(cashDayId, "cashDayId") })
      .sort({ createdAt: -1 })
      .lean();

    return rows.map((m) => this.toMovPublic(m));
  }

  /**
   * ✅ Mejora clave:
   * - crea CashMovement
   * - crea FinanceMovement espejo (source=CASH)
   * - recalcula expectedCash (aggregate)
   */
  async createMovement(user: any, dto: CreateMovementDto) {
    const cashDay = await this.cashDayModel.findById(oid(dto.cashDayId, "cashDayId"));
    if (!cashDay) throw new NotFoundException("Caja no encontrada.");
    if (cashDay.status === CashDayStatus.CLOSED) throw new BadRequestException("La caja está cerrada.");

    await this.assertFinanceDayNotLocked(cashDay.dateKey, user);

    const amount = Math.max(0, toMoney(dto.amount));
    if (amount <= 0) throw new BadRequestException("amount debe ser > 0");

    const categoryId = dto.categoryId ? oid(dto.categoryId, "categoryId") : null;

    const refType = (dto as any).refType ?? null;
    const refId = (dto as any).refId ?? null;

    // 1) cash movement
    const cashMov = await this.movModel.create({
      cashDayId: cashDay._id,
      type: dto.type,
      method: dto.method,
      amount,
      categoryId,
      concept: (dto.concept ?? "").trim(),
      note: (dto.note ?? "").trim(),
      createdByUserId: pickUserId(user),
      refType,
      refId,
    });

    // 2) finance mirror
    // Solo impacta CASH expectedCash cuando method=CASH, pero FINANCE debe registrar todo (transfer/card/etc)
    const finAccountId = await this.resolveFinanceAccountIdForMethod(dto.method);
    if (!finAccountId) throw new BadRequestException("No hay FinanceAccount configurada para este método.");

    const finType =
      dto.type === CashMovementType.INCOME ? FinType.INCOME : FinType.EXPENSE;

    const finDir =
      dto.type === CashMovementType.INCOME ? FinDir.IN : FinDir.OUT;

    await this.finMovModel.create({
      dateKey: cashDay.dateKey,
      type: finType,
      direction: finDir,
      amount,
      accountId: oid(finAccountId, "accountId"),
      categoryId: categoryId ? categoryId : null,
      notes: `[CASH] ${dto.method} - ${dto.concept ?? ""}`.trim(),
      createdByUserId: oid(pickUserId(user), "userId"),

      // link
      source: "CASH",
      refType,
      refId,
      cashDayId: cashDay._id,

      // snapshots opcionales (si ya los manejás en finance)
      // accountNameSnapshot, categoryNameSnapshot los podés setear si querés
    } as any);

    await this.recalcExpectedCash(String(cashDay._id));
    return this.toMovPublic(cashMov);
  }

  /**
   * ✅ Mejora clave:
   * - void cash movement
   * - void finance movement espejo (source=CASH + cashDayId + refType/refId o por cashMovementId)
   */
  async voidMovement(user: any, movementId: string, reason?: string) {
    const mov = await this.movModel.findById(oid(movementId, "movementId"));
    if (!mov) throw new NotFoundException("Movimiento no encontrado.");

    const cashDay = await this.cashDayModel.findById(mov.cashDayId);
    if (!cashDay) throw new NotFoundException("Caja no encontrada.");

    if (cashDay.status === CashDayStatus.CLOSED && !hasRole(user, "ADMIN")) {
      throw new BadRequestException("Caja cerrada: solo ADMIN puede anular.");
    }

    await this.assertFinanceDayNotLocked(cashDay.dateKey, user);

    const updated = await this.movModel
      .findByIdAndUpdate(
        mov._id,
        {
          voided: true,
          voidedAt: new Date(),
          voidedByUserId: pickUserId(user),
          voidReason: (reason ?? "").trim(),
        },
        { new: true },
      )
      .lean();

    // void finance mirror
    await this.finMovModel.updateMany(
      {
        source: "CASH",
        cashDayId: mov.cashDayId,
        // opcional: si querés estrictísimo, agregá cashMovementId como campo en finance
        refType: mov.refType ?? null,
        refId: mov.refId ?? null,
        amount: mov.amount,
        dateKey: cashDay.dateKey,
        status: { $ne: "VOID" },
      } as any,
      { $set: { status: "VOID" } } as any,
    );

    await this.recalcExpectedCash(String(cashDay._id));
    return this.toMovPublic(updated);
  }

  /**
   * ✅ expectedCash = openingCash + (CASH income - CASH expense) (voided=false)
   * ahora con AGGREGATE (no fetch rows)
   */
  private async recalcExpectedCash(cashDayId: string) {
    const day = await this.cashDayModel.findById(oid(cashDayId, "cashDayId")).lean();
    if (!day) throw new NotFoundException("Caja no encontrada.");

    const agg = await this.movModel.aggregate([
      { $match: { cashDayId: new Types.ObjectId(cashDayId), voided: false, method: PaymentMethod.CASH } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
        },
      },
    ]);

    let income = 0;
    let expense = 0;
    for (const r of agg) {
      const t = String(r._id);
      if (t === CashMovementType.INCOME) income = toMoney(r.total);
      if (t === CashMovementType.EXPENSE) expense = toMoney(r.total);
    }

    const expectedCash = toMoney(day.openingCash) + income - expense;

    const updated = await this.cashDayModel
      .findByIdAndUpdate(
        cashDayId,
        {
          expectedCash,
          diffCash: day.countedCash == null ? 0 : toMoney(day.countedCash) - expectedCash,
        },
        { new: true },
      )
      .lean();

    return updated!;
  }

  // ============================
  // Summary
  // ============================

  async getDaySummary(user: any, dateKey: string, branchId?: string) {
    assertDateKey(dateKey);

    // get or create
    const dayPublic = await this.getOrCreateDay(user, dateKey, branchId);

    // expectedCash up to date
    const recDay = await this.recalcExpectedCash(dayPublic.id);
    const cashDayObjectId = oid(dayPublic.id, "cashDayId");

    // Totales por método / tipo
    const byMethodAgg = await this.movModel.aggregate([
      { $match: { cashDayId: cashDayObjectId, voided: false } },
      {
        $group: {
          _id: { method: "$method", type: "$type" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const methodMap: Record<string, any> = {};
    for (const row of byMethodAgg) {
      const method = row?._id?.method;
      const type = row?._id?.type;
      if (!method || !type) continue;

      if (!methodMap[method]) {
        methodMap[method] = { method, income: 0, expense: 0, net: 0, countIncome: 0, countExpense: 0 };
      }

      if (type === CashMovementType.INCOME) {
        methodMap[method].income += Number(row.total || 0);
        methodMap[method].countIncome += Number(row.count || 0);
      } else {
        methodMap[method].expense += Number(row.total || 0);
        methodMap[method].countExpense += Number(row.count || 0);
      }

      methodMap[method].net = methodMap[method].income - methodMap[method].expense;
    }

    const byMethod = Object.values(methodMap).sort((a: any, b: any) =>
      String(a.method).localeCompare(String(b.method)),
    );

    // Totales por categoría (lookup a FinanceCategory)
    const byCategoryAgg = await this.movModel.aggregate([
      { $match: { cashDayId: cashDayObjectId, voided: false, categoryId: { $ne: null } } },
      { $group: { _id: { categoryId: "$categoryId", type: "$type" }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      {
        $lookup: {
          from: "financecategories",
          localField: "_id.categoryId",
          foreignField: "_id",
          as: "cat",
        },
      },
      { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          categoryId: { $toString: "$_id.categoryId" },
          type: "$_id.type",
          total: 1,
          count: 1,
          categoryName: "$cat.name",
          categoryType: "$cat.type",
        },
      },
    ]);

    const catMap: Record<string, any> = {};
    for (const row of byCategoryAgg) {
      const cid = row.categoryId;
      if (!cid) continue;

      if (!catMap[cid]) {
        catMap[cid] = {
          categoryId: cid,
          name: row.categoryName ?? "—",
          type: row.categoryType ?? null,
          income: 0,
          expense: 0,
          net: 0,
          countIncome: 0,
          countExpense: 0,
        };
      }

      if (row.type === CashMovementType.INCOME) {
        catMap[cid].income += Number(row.total || 0);
        catMap[cid].countIncome += Number(row.count || 0);
      } else {
        catMap[cid].expense += Number(row.total || 0);
        catMap[cid].countExpense += Number(row.count || 0);
      }

      catMap[cid].net = catMap[cid].income - catMap[cid].expense;
    }

    const byCategory = Object.values(catMap).sort((a: any, b: any) =>
      String(a.name).localeCompare(String(b.name)),
    );

    const totalIncome = byMethod.reduce((acc: number, x: any) => acc + Number(x.income || 0), 0);
    const totalExpense = byMethod.reduce((acc: number, x: any) => acc + Number(x.expense || 0), 0);
    const net = totalIncome - totalExpense;

    const cashRow = byMethod.find((x: any) => x.method === PaymentMethod.CASH);
    const cashNet = cashRow ? Number(cashRow.net || 0) : 0;

    return {
      day: this.toCashDayPublic(recDay),
      totals: { income: totalIncome, expense: totalExpense, net, cashNet },
      byMethod,
      byCategory,
    };
  }
}
