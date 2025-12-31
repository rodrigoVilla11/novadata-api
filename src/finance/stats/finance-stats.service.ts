import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import {
  FinanceMovement,
  FinanceMovementDocument,
  FinanceMovementDirection,
  FinanceMovementType,
} from "../movements/schemas/finance-movement.schema";

import { FinanceAccountsService } from "../accounts/finance-accounts.service";
import { resolveRange, PeriodType, isValidDateKey } from "./finance-stats.utils";

function escRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function prevDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

@Injectable()
export class FinanceStatsService {
  constructor(
    @InjectModel(FinanceMovement.name)
    private readonly movementModel: Model<FinanceMovementDocument>,
    private readonly accountsService: FinanceAccountsService,
  ) {}

  private sumNum(x: any) {
    return Number(x ?? 0) || 0;
  }

  /**
   * Saldos hasta dateKey inclusive (ledger):
   * openingBalance + Σ signedMovement
   *
   * signedMovement:
   * - direction IN  => +amount
   * - direction OUT => -amount
   * - direction ADJUSTMENT => adjustmentSign * amount (default +)
   *
   * Legacy fallback:
   * - type=TRANSFER sin direction => -amount en accountId y +amount en toAccountId
   */
  private async computeBalancesUpTo(dateKey: string) {
    if (!isValidDateKey(dateKey)) throw new BadRequestException("dateKey inválido");

    const accounts = await this.accountsService.findAll({
      active: undefined as any,
      includeDeleted: false,
      q: undefined as any,
      type: undefined as any,
    } as any);

    const baseMap = new Map<string, number>();
    for (const a of accounts) baseMap.set(a.id, this.sumNum(a.openingBalance));

    // Aggregate por cuenta (signed)
    const agg = await this.movementModel.aggregate([
      { $match: { status: { $ne: "VOID" }, dateKey: { $lte: dateKey } } },
      {
        $project: {
          accountId: 1,
          toAccountId: 1,
          type: 1,
          direction: 1,
          amount: 1,
          adjustmentSign: 1,
        },
      },
      {
        $addFields: {
          signed: {
            $switch: {
              branches: [
                { case: { $eq: ["$direction", FinanceMovementDirection.IN] }, then: "$amount" },
                {
                  case: { $eq: ["$direction", FinanceMovementDirection.OUT] },
                  then: { $multiply: ["$amount", -1] },
                },
                {
                  case: { $eq: ["$direction", FinanceMovementDirection.ADJUSTMENT] },
                  then: { $multiply: ["$amount", { $ifNull: ["$adjustmentSign", 1] }] },
                },
              ],
              default: null, // legacy
            },
          },
        },
      },
      {
        $group: {
          _id: "$accountId",
          sumSigned: { $sum: { $ifNull: ["$signed", 0] } },
          legacy: {
            $push: { type: "$type", direction: "$direction", amount: "$amount", toAccountId: "$toAccountId" },
          },
        },
      },
    ]);

    // aplicar signed moderno
    for (const r of agg) {
      const accId = r._id ? String(r._id) : null;
      if (!accId) continue;
      if (!baseMap.has(accId)) baseMap.set(accId, 0);
      baseMap.set(accId, (baseMap.get(accId) ?? 0) + this.sumNum(r.sumSigned));
    }

    // fallback legacy transfer (sin direction)
    for (const r of agg) {
      const fromId = r._id ? String(r._id) : null;
      if (!fromId) continue;

      const legacy = Array.isArray(r.legacy) ? r.legacy : [];
      for (const m of legacy) {
        if (m?.type !== FinanceMovementType.TRANSFER) continue;
        if (m?.direction) continue; // ya está en signed moderno
        const amt = this.sumNum(m.amount);
        const toId = m.toAccountId ? String(m.toAccountId) : null;

        baseMap.set(fromId, (baseMap.get(fromId) ?? 0) - amt);
        if (toId) {
          if (!baseMap.has(toId)) baseMap.set(toId, 0);
          baseMap.set(toId, (baseMap.get(toId) ?? 0) + amt);
        }
      }
    }

    return baseMap;
  }

  async getStats(params: { periodType: PeriodType; dateKey?: string; from?: string; to?: string; q?: string }) {
    let range: { from: string; to: string };
    try {
      range = resolveRange(params);
    } catch (e: any) {
      throw new BadRequestException(e?.message || "Rango inválido");
    }

    // -----------------------------
    // 1) Totales generales (P&L) + transfers + adjustments
    // -----------------------------
    const totalsAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $project: {
          type: 1,
          direction: 1,
          amount: 1,
          adjustmentSign: 1,
        },
      },
      {
        $addFields: {
          signed: {
            $switch: {
              branches: [
                { case: { $eq: ["$direction", FinanceMovementDirection.IN] }, then: "$amount" },
                {
                  case: { $eq: ["$direction", FinanceMovementDirection.OUT] },
                  then: { $multiply: ["$amount", -1] },
                },
                {
                  case: { $eq: ["$direction", FinanceMovementDirection.ADJUSTMENT] },
                  then: { $multiply: ["$amount", { $ifNull: ["$adjustmentSign", 1] }] },
                },
              ],
              default: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: { type: "$type", direction: "$direction" },
          totalAmount: { $sum: "$amount" },
          totalSigned: { $sum: "$signed" },
          count: { $sum: 1 },
        },
      },
    ]);

    let income = 0;
    let expense = 0;
    let transferIn = 0;
    let transferOut = 0;
    let adjustmentsSigned = 0;

    for (const r of totalsAgg) {
      const t = String(r._id?.type);
      const d = String(r._id?.direction);
      const totalAmount = this.sumNum(r.totalAmount);
      const totalSigned = this.sumNum(r.totalSigned);

      // P&L puro
      if (t === FinanceMovementType.INCOME) income += totalAmount;
      if (t === FinanceMovementType.EXPENSE) expense += totalAmount;

      // transfers (si ya son 2 asientos, direction IN/OUT dentro de type TRANSFER)
      if (t === FinanceMovementType.TRANSFER) {
        if (d === FinanceMovementDirection.IN) transferIn += totalAmount;
        if (d === FinanceMovementDirection.OUT) transferOut += totalAmount;
        // si legacy (sin direction) podría no entrar bien; pero en totals nos sirve más por amount.
      }

      if (d === FinanceMovementDirection.ADJUSTMENT) {
        adjustmentsSigned += totalSigned; // puede ser + o -
      }
    }

    // -----------------------------
    // 2) Breakdown por cuenta (income/expense/transferIn/transferOut/adjustments) + saldo inicio/fin
    // -----------------------------
    const byAccountAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $project: {
          accountId: 1,
          toAccountId: 1,
          type: 1,
          direction: 1,
          amount: 1,
          adjustmentSign: 1,
        },
      },
      {
        $facet: {
          pnl: [
            { $match: { type: { $in: [FinanceMovementType.INCOME, FinanceMovementType.EXPENSE] } } },
            {
              $group: {
                _id: { accountId: "$accountId", type: "$type" },
                total: { $sum: "$amount" },
              },
            },
          ],
          transfer: [
            { $match: { type: FinanceMovementType.TRANSFER } },
            {
              $group: {
                _id: { accountId: "$accountId", direction: "$direction" },
                total: { $sum: "$amount" },
              },
            },
          ],
          adjustment: [
            { $match: { direction: FinanceMovementDirection.ADJUSTMENT } },
            {
              $group: {
                _id: "$accountId",
                signed: { $sum: { $multiply: ["$amount", { $ifNull: ["$adjustmentSign", 1] }] } },
                gross: { $sum: "$amount" },
              },
            },
          ],
          legacyTransfer: [
            // fallback: type TRANSFER sin direction (viejo)
            { $match: { type: FinanceMovementType.TRANSFER, direction: { $in: [null, undefined] } } },
            {
              $group: {
                _id: { from: "$accountId", to: "$toAccountId" },
                total: { $sum: "$amount" },
              },
            },
          ],
        },
      },
    ]);

    const facet = byAccountAgg?.[0] ?? { pnl: [], transfer: [], adjustment: [], legacyTransfer: [] };

    const accMap = new Map<
      string,
      { income: number; expense: number; transferOut: number; transferIn: number; adjustmentsSigned: number }
    >();

    const ensure = (id: string) => {
      if (!accMap.has(id)) accMap.set(id, { income: 0, expense: 0, transferOut: 0, transferIn: 0, adjustmentsSigned: 0 });
      return accMap.get(id)!;
    };

    // pnl (income/expense)
    for (const r of facet.pnl || []) {
      const accountId = String(r._id?.accountId);
      const type = String(r._id?.type);
      const total = this.sumNum(r.total);
      const obj = ensure(accountId);
      if (type === FinanceMovementType.INCOME) obj.income += total;
      if (type === FinanceMovementType.EXPENSE) obj.expense += total;
    }

    // transfer moderno (por direction IN/OUT)
    for (const r of facet.transfer || []) {
      const accountId = String(r._id?.accountId);
      const dir = String(r._id?.direction);
      const total = this.sumNum(r.total);
      const obj = ensure(accountId);
      if (dir === FinanceMovementDirection.OUT) obj.transferOut += total;
      if (dir === FinanceMovementDirection.IN) obj.transferIn += total;
    }

    // adjustments
    for (const r of facet.adjustment || []) {
      const accountId = String(r._id);
      const signed = this.sumNum(r.signed);
      ensure(accountId).adjustmentsSigned += signed;
    }

    // legacy transfers fallback
    for (const r of facet.legacyTransfer || []) {
      const fromId = r._id?.from ? String(r._id.from) : null;
      const toId = r._id?.to ? String(r._id.to) : null;
      const total = this.sumNum(r.total);
      if (fromId) ensure(fromId).transferOut += total;
      if (toId) ensure(toId).transferIn += total;
    }

    // saldos inicio/fin
    const startKey = prevDateKey(range.from);
    const startBalances = await this.computeBalancesUpTo(startKey);
    const endBalances = await this.computeBalancesUpTo(range.to);

    const accounts = await this.accountsService.findAll({
      active: undefined as any,
      includeDeleted: false,
      q: undefined as any,
      type: undefined as any,
    } as any);

    const byAccount = accounts.map((a) => {
      const m = accMap.get(a.id) ?? { income: 0, expense: 0, transferOut: 0, transferIn: 0, adjustmentsSigned: 0 };
      const opening = this.sumNum(a.openingBalance);
      const startBalance = startBalances.get(a.id) ?? opening;
      const endBalance = endBalances.get(a.id) ?? opening;

      return {
        accountId: a.id,
        income: m.income,
        expense: m.expense,
        net: m.income - m.expense,
        transferOut: m.transferOut,
        transferIn: m.transferIn,
        adjustmentsSigned: m.adjustmentsSigned,
        startBalance,
        endBalance,
      };
    });

    // -----------------------------
    // 3) Breakdown por categoría (solo P&L)
    // -----------------------------
    const byCategoryAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          type: { $in: [FinanceMovementType.INCOME, FinanceMovementType.EXPENSE] },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: { categoryId: "$categoryId", type: "$type", name: "$categoryNameSnapshot", code: "$categoryCodeSnapshot" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    // -----------------------------
    // 4) Serie diaria (P&L) + opcional adjustments
    // -----------------------------
    const seriesAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $project: {
          dateKey: 1,
          type: 1,
          direction: 1,
          amount: 1,
          adjustmentSign: 1,
        },
      },
      {
        $group: {
          _id: { dateKey: "$dateKey", type: "$type", direction: "$direction" },
          totalAmount: { $sum: "$amount" },
          signed: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $eq: ["$direction", FinanceMovementDirection.IN] }, then: "$amount" },
                  { case: { $eq: ["$direction", FinanceMovementDirection.OUT] }, then: { $multiply: ["$amount", -1] } },
                  {
                    case: { $eq: ["$direction", FinanceMovementDirection.ADJUSTMENT] },
                    then: { $multiply: ["$amount", { $ifNull: ["$adjustmentSign", 1] }] },
                  },
                ],
                default: 0,
              },
            },
          },
        },
      },
      { $sort: { "_id.dateKey": 1 } },
    ]);

    const seriesMap = new Map<string, { income: number; expense: number; adjustmentsSigned: number }>();

    for (const r of seriesAgg) {
      const dk = String(r._id?.dateKey);
      const type = String(r._id?.type);
      const dir = String(r._id?.direction);
      const totalAmount = this.sumNum(r.totalAmount);
      const signed = this.sumNum(r.signed);

      if (!seriesMap.has(dk)) seriesMap.set(dk, { income: 0, expense: 0, adjustmentsSigned: 0 });

      const obj = seriesMap.get(dk)!;

      if (type === FinanceMovementType.INCOME) obj.income += totalAmount;
      if (type === FinanceMovementType.EXPENSE) obj.expense += totalAmount;

      if (dir === FinanceMovementDirection.ADJUSTMENT) obj.adjustmentsSigned += signed;
    }

    const seriesDaily = [...seriesMap.entries()].map(([dateKey, v]) => ({
      dateKey,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
      adjustmentsSigned: v.adjustmentsSigned,
    }));

    return {
      range,
      totals: {
        income,
        expense,
        net: income - expense,
        transferOut,
        transferIn,
        adjustmentsSigned,
      },
      byAccount,
      byCategory: (byCategoryAgg || []).map((r) => ({
        categoryId: r._id?.categoryId ? String(r._id.categoryId) : null,
        type: String(r._id?.type) as "INCOME" | "EXPENSE",
        total: this.sumNum(r.total),
        count: Number(r.count ?? 0),
        nameSnapshot: r._id?.name ?? null,
        codeSnapshot: r._id?.code ?? null,
      })),
      seriesDaily,
    };
  }
}
