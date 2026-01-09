import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import {
  FinanceMovement,
  FinanceMovementDocument,
  FinanceMovementDirection,
  FinanceMovementType,
} from "../movements/schemas/finance-movement.schema";

import { FinanceAccountsService } from "../accounts/finance-accounts.service";
import { resolveRange, PeriodType, isValidDateKey } from "./finance-stats.utils";

function prevDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function branchOid(branchId: string) {
  if (!branchId || !Types.ObjectId.isValid(branchId)) {
    throw new BadRequestException("branchId inválido");
  }
  return new Types.ObjectId(branchId);
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

  private async computeBalancesUpTo(params: { branchId: string; dateKey: string }) {
    const { branchId, dateKey } = params;
    if (!isValidDateKey(dateKey)) throw new BadRequestException("dateKey inválido");

    const b = branchOid(branchId);

    const accounts = await this.accountsService.findAll({
      branchId,
      active: undefined as any,
      includeDeleted: false,
      q: undefined as any,
      type: undefined as any,
    } as any);

    const baseMap = new Map<string, number>();
    for (const a of accounts) baseMap.set(a.id, this.sumNum(a.openingBalance));

    const agg = await this.movementModel.aggregate([
      { $match: { branchId: b, status: { $ne: "VOID" }, dateKey: { $lte: dateKey } } },
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
                { case: { $eq: ["$direction", FinanceMovementDirection.OUT] }, then: { $multiply: ["$amount", -1] } },
                {
                  case: { $eq: ["$direction", FinanceMovementDirection.ADJUSTMENT] },
                  then: { $multiply: ["$amount", { $ifNull: ["$adjustmentSign", 1] }] },
                },
              ],
              default: null,
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

    for (const r of agg) {
      const accId = r._id ? String(r._id) : null;
      if (!accId) continue;
      if (!baseMap.has(accId)) baseMap.set(accId, 0);
      baseMap.set(accId, (baseMap.get(accId) ?? 0) + this.sumNum(r.sumSigned));
    }

    for (const r of agg) {
      const fromId = r._id ? String(r._id) : null;
      if (!fromId) continue;

      const legacy = Array.isArray(r.legacy) ? r.legacy : [];
      for (const m of legacy) {
        if (m?.type !== FinanceMovementType.TRANSFER) continue;
        if (m?.direction) continue;
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

  async getStats(params: {
    branchId: string;
    periodType: PeriodType;
    dateKey?: string;
    from?: string;
    to?: string;
    q?: string;
  }) {
    const b = branchOid(params.branchId);

    let range: { from: string; to: string };
    try {
      range = resolveRange(params);
    } catch (e: any) {
      throw new BadRequestException(e?.message || "Rango inválido");
    }

    // 1) Totales generales
    const totalsAgg = await this.movementModel.aggregate([
      {
        $match: {
          branchId: b,
          status: { $ne: "VOID" },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      { $project: { type: 1, direction: 1, amount: 1, adjustmentSign: 1 } },
      {
        $addFields: {
          signed: {
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
      {
        $group: {
          _id: { type: "$type", direction: "$direction" },
          totalAmount: { $sum: "$amount" },
          totalSigned: { $sum: "$signed" },
          count: { $sum: 1 },
        },
      },
    ]);

    let income = 0, expense = 0, transferIn = 0, transferOut = 0, adjustmentsSigned = 0;

    for (const r of totalsAgg) {
      const t = String(r._id?.type);
      const d = String(r._id?.direction);
      const totalAmount = this.sumNum(r.totalAmount);
      const totalSigned = this.sumNum(r.totalSigned);

      if (t === FinanceMovementType.INCOME) income += totalAmount;
      if (t === FinanceMovementType.EXPENSE) expense += totalAmount;

      if (t === FinanceMovementType.TRANSFER) {
        if (d === FinanceMovementDirection.IN) transferIn += totalAmount;
        if (d === FinanceMovementDirection.OUT) transferOut += totalAmount;
      }

      if (d === FinanceMovementDirection.ADJUSTMENT) {
        adjustmentsSigned += totalSigned;
      }
    }

    // 2) Breakdown por cuenta + saldo inicio/fin
    const byAccountAgg = await this.movementModel.aggregate([
      {
        $match: {
          branchId: b,
          status: { $ne: "VOID" },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      { $project: { accountId: 1, toAccountId: 1, type: 1, direction: 1, amount: 1, adjustmentSign: 1 } },
      {
        $facet: {
          pnl: [
            { $match: { type: { $in: [FinanceMovementType.INCOME, FinanceMovementType.EXPENSE] } } },
            { $group: { _id: { accountId: "$accountId", type: "$type" }, total: { $sum: "$amount" } } },
          ],
          transfer: [
            { $match: { type: FinanceMovementType.TRANSFER } },
            { $group: { _id: { accountId: "$accountId", direction: "$direction" }, total: { $sum: "$amount" } } },
          ],
          adjustment: [
            { $match: { direction: FinanceMovementDirection.ADJUSTMENT } },
            {
              $group: {
                _id: "$accountId",
                signed: { $sum: { $multiply: ["$amount", { $ifNull: ["$adjustmentSign", 1] }] } },
              },
            },
          ],
          legacyTransfer: [
            { $match: { type: FinanceMovementType.TRANSFER, direction: { $in: [null, undefined] } } },
            { $group: { _id: { from: "$accountId", to: "$toAccountId" }, total: { $sum: "$amount" } } },
          ],
        },
      },
    ]);

    const facet = byAccountAgg?.[0] ?? { pnl: [], transfer: [], adjustment: [], legacyTransfer: [] };

    const accMap = new Map<string, { income: number; expense: number; transferOut: number; transferIn: number; adjustmentsSigned: number }>();
    const ensure = (id: string) => {
      if (!accMap.has(id)) accMap.set(id, { income: 0, expense: 0, transferOut: 0, transferIn: 0, adjustmentsSigned: 0 });
      return accMap.get(id)!;
    };

    for (const r of facet.pnl || []) {
      const accountId = String(r._id?.accountId);
      const type = String(r._id?.type);
      const total = this.sumNum(r.total);
      const obj = ensure(accountId);
      if (type === FinanceMovementType.INCOME) obj.income += total;
      if (type === FinanceMovementType.EXPENSE) obj.expense += total;
    }

    for (const r of facet.transfer || []) {
      const accountId = String(r._id?.accountId);
      const dir = String(r._id?.direction);
      const total = this.sumNum(r.total);
      const obj = ensure(accountId);
      if (dir === FinanceMovementDirection.OUT) obj.transferOut += total;
      if (dir === FinanceMovementDirection.IN) obj.transferIn += total;
    }

    for (const r of facet.adjustment || []) {
      const accountId = String(r._id);
      ensure(accountId).adjustmentsSigned += this.sumNum(r.signed);
    }

    for (const r of facet.legacyTransfer || []) {
      const fromId = r._id?.from ? String(r._id.from) : null;
      const toId = r._id?.to ? String(r._id.to) : null;
      const total = this.sumNum(r.total);
      if (fromId) ensure(fromId).transferOut += total;
      if (toId) ensure(toId).transferIn += total;
    }

    const startKey = prevDateKey(range.from);
    const startBalances = await this.computeBalancesUpTo({ branchId: params.branchId, dateKey: startKey });
    const endBalances = await this.computeBalancesUpTo({ branchId: params.branchId, dateKey: range.to });

    const accounts = await this.accountsService.findAll({
      branchId: params.branchId,
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

    // 3) Breakdown por categoría (solo P&L)
    const byCategoryAgg = await this.movementModel.aggregate([
      {
        $match: {
          branchId: b,
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

    // 4) Serie diaria
    const seriesAgg = await this.movementModel.aggregate([
      {
        $match: {
          branchId: b,
          status: { $ne: "VOID" },
          dateKey: { $gte: range.from, $lte: range.to },
        },
      },
      { $project: { dateKey: 1, type: 1, direction: 1, amount: 1, adjustmentSign: 1 } },
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
