import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { FinanceMovement, FinanceMovementDocument } from "../movements/schemas/finance-movement.schema";
import { FinanceAccountsService } from "../accounts/finance-accounts.service";
import { resolveRange, PeriodType } from "./finance-stats.utils";

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
   * Saldo computado de una cuenta hasta dateKey inclusive:
   * openingBalance + incomes - expenses + transferIn - transferOut
   */
  private async computeBalancesUpTo(dateKey: string) {
    const accounts = await this.accountsService.findAll({
      active: undefined as any,
      includeDeleted: false,
      q: undefined as any,
      type: undefined as any,
    } as any);

    const baseMap = new Map<string, number>();
    for (const a of accounts) baseMap.set(a.id, this.sumNum(a.openingBalance));

    const rows = await this.movementModel.aggregate([
      { $match: { status: { $ne: "VOID" }, dateKey: { $lte: dateKey } } },
      { $project: { dateKey: 1, type: 1, amount: 1, accountId: 1, toAccountId: 1 } },
    ]);

    for (const r of rows) {
      const type = String(r.type);
      const amt = this.sumNum(r.amount);
      const fromId = r.accountId ? String(r.accountId) : null;
      const toId = r.toAccountId ? String(r.toAccountId) : null;
      if (!fromId) continue;

      if (!baseMap.has(fromId)) baseMap.set(fromId, 0);
      if (toId && !baseMap.has(toId)) baseMap.set(toId, 0);

      if (type === "INCOME") baseMap.set(fromId, (baseMap.get(fromId) ?? 0) + amt);
      if (type === "EXPENSE") baseMap.set(fromId, (baseMap.get(fromId) ?? 0) - amt);
      if (type === "TRANSFER") {
        baseMap.set(fromId, (baseMap.get(fromId) ?? 0) - amt);
        if (toId) baseMap.set(toId, (baseMap.get(toId) ?? 0) + amt);
      }
    }

    return baseMap; // key: accountId string
  }

  async getStats(params: {
    periodType: PeriodType;
    dateKey?: string;
    from?: string;
    to?: string;
  }) {
    let range: { from: string; to: string };
    try {
      range = resolveRange(params);
    } catch (e: any) {
      throw new BadRequestException(e?.message || "Rango inválido");
    }

    // 1) Totales generales por tipo (incluye transfer in/out)
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
          amount: 1,
          accountId: 1,
          toAccountId: 1,
        },
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
        },
      },
    ]);

    const totalsMap = new Map<string, number>();
    for (const r of totalsAgg) totalsMap.set(String(r._id), this.sumNum(r.total));

    // transferIn/Out se calculan con aggregate específico
    const transferAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          type: "TRANSFER",
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: null,
          transferOut: { $sum: "$amount" }, // siempre sale de accountId
          transferIn: { $sum: "$amount" },  // siempre entra a toAccountId (mismo total)
        },
      },
    ]);

    const income = totalsMap.get("INCOME") ?? 0;
    const expense = totalsMap.get("EXPENSE") ?? 0;

    const transferOut = this.sumNum(transferAgg?.[0]?.transferOut);
    const transferIn = this.sumNum(transferAgg?.[0]?.transferIn);

    // 2) Breakdown por cuenta (income/expense/transferIn/transferOut)
    const byAccountAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $facet: {
          incomeExpense: [
            { $match: { type: { $in: ["INCOME", "EXPENSE"] } } },
            {
              $group: {
                _id: { accountId: "$accountId", type: "$type" },
                total: { $sum: "$amount" },
              },
            },
          ],
          transferOut: [
            { $match: { type: "TRANSFER" } },
            { $group: { _id: "$accountId", total: { $sum: "$amount" } } },
          ],
          transferIn: [
            { $match: { type: "TRANSFER" } },
            { $group: { _id: "$toAccountId", total: { $sum: "$amount" } } },
          ],
        },
      },
    ]);

    const facet = byAccountAgg?.[0] ?? { incomeExpense: [], transferOut: [], transferIn: [] };

    const accMap = new Map<
      string,
      { income: number; expense: number; transferOut: number; transferIn: number }
    >();

    const ensure = (id: string) => {
      if (!accMap.has(id)) accMap.set(id, { income: 0, expense: 0, transferOut: 0, transferIn: 0 });
      return accMap.get(id)!;
    };

    for (const r of facet.incomeExpense || []) {
      const accountId = String(r._id?.accountId);
      const type = String(r._id?.type);
      const total = this.sumNum(r.total);
      const obj = ensure(accountId);
      if (type === "INCOME") obj.income += total;
      if (type === "EXPENSE") obj.expense += total;
    }

    for (const r of facet.transferOut || []) {
      const accountId = String(r._id);
      const total = this.sumNum(r.total);
      ensure(accountId).transferOut += total;
    }

    for (const r of facet.transferIn || []) {
      if (!r._id) continue;
      const accountId = String(r._id);
      const total = this.sumNum(r.total);
      ensure(accountId).transferIn += total;
    }

    // 3) Breakdown por categoría (income/expense)
    const byCategoryAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          type: { $in: ["INCOME", "EXPENSE"] },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: { categoryId: "$categoryId", type: "$type", name: "$categoryNameSnapshot" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    // 4) Serie diaria (para charts)
    const seriesAgg = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          type: { $in: ["INCOME", "EXPENSE"] },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: { dateKey: "$dateKey", type: "$type" },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.dateKey": 1 } },
    ]);

    const seriesMap = new Map<string, { income: number; expense: number }>();
    for (const r of seriesAgg) {
      const dk = String(r._id?.dateKey);
      const type = String(r._id?.type);
      const total = this.sumNum(r.total);
      if (!seriesMap.has(dk)) seriesMap.set(dk, { income: 0, expense: 0 });
      const obj = seriesMap.get(dk)!;
      if (type === "INCOME") obj.income += total;
      if (type === "EXPENSE") obj.expense += total;
    }

    const seriesDaily = [...seriesMap.entries()].map(([dateKey, v]) => ({
      dateKey,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

    // 5) Saldos por cuenta al inicio y al final del rango
    // startBalance: hasta día anterior a range.from
    const startKey = this.prevDateKey(range.from);
    const startBalances = await this.computeBalancesUpTo(startKey);
    const endBalances = await this.computeBalancesUpTo(range.to);

    // Traer accounts (para devolver todas y tener rows ordenadas)
    const accounts = await this.accountsService.findAll({
      active: undefined as any,
      includeDeleted: false,
      q: undefined as any,
      type: undefined as any,
    } as any);

    const byAccount = accounts.map((a) => {
      const m = accMap.get(a.id) ?? { income: 0, expense: 0, transferOut: 0, transferIn: 0 };
      const startBalance = startBalances.get(a.id) ?? this.sumNum(a.openingBalance);
      const endBalance = endBalances.get(a.id) ?? this.sumNum(a.openingBalance);

      return {
        accountId: a.id,
        income: m.income,
        expense: m.expense,
        net: m.income - m.expense,
        transferOut: m.transferOut,
        transferIn: m.transferIn,
        startBalance,
        endBalance,
      };
    });

    const res = {
      range,
      totals: {
        income,
        expense,
        net: income - expense,
        transferOut,
        transferIn,
      },
      byAccount,
      byCategory: (byCategoryAgg || []).map((r) => ({
        categoryId: r._id?.categoryId ? String(r._id.categoryId) : null,
        type: String(r._id?.type) as "INCOME" | "EXPENSE",
        total: this.sumNum(r.total),
        count: Number(r.count ?? 0),
        nameSnapshot: r._id?.name ?? null,
      })),
      seriesDaily,
    };

    return res;
  }

  private prevDateKey(dateKey: string) {
    // dateKey: YYYY-MM-DD
    const [y, m, d] = dateKey.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    dt.setDate(dt.getDate() - 1);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }
}
