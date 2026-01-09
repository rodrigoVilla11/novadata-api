import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { FinanceAccountsService } from "../accounts/finance-accounts.service";
import { FinanceDayClosing, FinanceDayClosingDocument } from "./schemas/finance-day-closing.schema";
import { UpsertDayClosingDto } from "./dto/upsert-day-closing.dto";

import {
  FinanceMovement,
  FinanceMovementDocument,
  FinanceMovementDirection,
  FinanceMovementType,
} from "../movements/schemas/finance-movement.schema";

function assertDateKey(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) {
    throw new BadRequestException("dateKey inválido (YYYY-MM-DD)");
  }
}

function branchOid(branchId: string) {
  if (!branchId || !Types.ObjectId.isValid(branchId)) {
    throw new BadRequestException("branchId inválido");
  }
  return new Types.ObjectId(branchId);
}

@Injectable()
export class FinanceClosingsService {
  constructor(
    @InjectModel(FinanceDayClosing.name)
    private readonly closingModel: Model<FinanceDayClosingDocument>,

    @InjectModel(FinanceMovement.name)
    private readonly movementModel: Model<FinanceMovementDocument>,

    private readonly accountsService: FinanceAccountsService,
  ) {}

  private oid(id: string, field: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`${field} inválido`);
    return new Types.ObjectId(id);
  }

  private normBalances(input: Array<{ accountId: string; balance: number }>) {
    const map = new Map<string, number>();
    for (const r of input || []) {
      const k = String(r.accountId);
      const v = Number(r.balance ?? 0);
      map.set(k, v);
    }
    return [...map.entries()].map(([accountId, balance]) => ({ accountId, balance }));
  }

  /* =========================
   * Get or Create (branch)
   * ========================= */
  async getOrCreate(params: { branchId: string; dateKey: string; userId?: string }) {
    assertDateKey(params.dateKey);
    const b = branchOid(params.branchId);

    let row = await this.closingModel.findOne({ branchId: b, dateKey: params.dateKey });
    if (!row) {
      row = await this.closingModel.create({
        branchId: b,
        dateKey: params.dateKey,
        status: "OPEN",
        declaredBalances: [],
        computedBalances: [],
        diffBalances: [],
        notes: null,
        createdByUserId:
          params.userId && Types.ObjectId.isValid(params.userId)
            ? new Types.ObjectId(params.userId)
            : null,
        submittedByUserId: null,
        lockedByUserId: null,
        submittedAt: null,
        lockedAt: null,
      });
    }
    return row;
  }

  async getOne(params: { branchId: string; dateKey: string }) {
    assertDateKey(params.dateKey);
    const b = branchOid(params.branchId);

    const row = await this.closingModel
      .findOne({ branchId: b, dateKey: params.dateKey })
      .lean();

    if (!row) throw new NotFoundException("Cierre no encontrado");
    return this.toDTO(row);
  }

  async upsertDeclared(params: {
    branchId: string;
    dateKey: string;
    userId: string;
    dto: UpsertDayClosingDto;
  }) {
    assertDateKey(params.dateKey);

    const closing = await this.getOrCreate({
      branchId: params.branchId,
      dateKey: params.dateKey,
      userId: params.userId,
    });

    if (closing.status === "LOCKED") {
      throw new BadRequestException("El cierre está LOCKED y no se puede editar");
    }

    const declaredNorm = this.normBalances(params.dto.declaredBalances || []);

    // ✅ opcional: validar que las cuentas existan en esta branch (evita ids cruzados)
    // si querés hard validation, descomentá:
    // for (const r of declaredNorm) {
    //   await this.accountsService.findOne({ branchId: params.branchId, id: r.accountId });
    // }

    closing.declaredBalances = declaredNorm.map((r) => ({
      accountId: this.oid(r.accountId, "accountId"),
      balance: Number(r.balance ?? 0),
    })) as any;

    if (params.dto.notes !== undefined) closing.notes = params.dto.notes ?? null;

    await closing.save();
    return this.toDTO(closing.toObject());
  }

  async submit(params: { branchId: string; dateKey: string; userId: string }) {
    assertDateKey(params.dateKey);

    const closing = await this.getOrCreate({
      branchId: params.branchId,
      dateKey: params.dateKey,
      userId: params.userId,
    });

    if (closing.status === "LOCKED") {
      throw new BadRequestException("El cierre está LOCKED y no se puede enviar");
    }

    // 1) computed usando ledger (incluye openingBalance)
    const computed = await this.computeBalancesUpTo({
      branchId: params.branchId,
      dateKey: params.dateKey,
    });

    const computedMap = new Map<string, number>();
    for (const c of computed) computedMap.set(String(c.accountId), c.balance);

    const declaredMap = new Map<string, number>();
    for (const d of closing.declaredBalances || []) {
      declaredMap.set(String(d.accountId), Number(d.balance ?? 0));
    }

    // diffs: solo para cuentas declaradas (mantenemos tu regla)
    const diffs: Array<{ accountId: Types.ObjectId; balance: number }> = [];
    for (const [accIdStr, declaredBal] of declaredMap.entries()) {
      const comp = computedMap.get(accIdStr) ?? 0;
      if (!Types.ObjectId.isValid(accIdStr)) continue;
      diffs.push({ accountId: new Types.ObjectId(accIdStr), balance: declaredBal - comp });
    }

    closing.computedBalances = computed.map((x) => ({
      accountId: x.accountId,
      balance: x.balance,
    })) as any;

    closing.diffBalances = diffs as any;

    closing.status = "SUBMITTED";
    closing.submittedAt = new Date();
    closing.submittedByUserId = this.oid(params.userId, "userId");

    await closing.save();
    return this.toDTO(closing.toObject());
  }

  async lock(params: { branchId: string; dateKey: string; adminUserId: string }) {
    assertDateKey(params.dateKey);

    const closing = await this.getOrCreate({
      branchId: params.branchId,
      dateKey: params.dateKey,
      userId: params.adminUserId,
    });

    if (closing.status !== "SUBMITTED") {
      throw new BadRequestException("Solo se puede LOCKEAR un cierre SUBMITTED");
    }

    closing.status = "LOCKED";
    closing.lockedAt = new Date();
    closing.lockedByUserId = this.oid(params.adminUserId, "userId");
    await closing.save();

    return this.toDTO(closing.toObject());
  }

  /**
   * Calcula saldos por cuenta hasta dateKey inclusive (por branch):
   * openingBalance + Σ signedMovement
   */
  async computeBalancesUpTo(params: {
    branchId: string;
    dateKey: string;
  }): Promise<Array<{ accountId: Types.ObjectId; balance: number }>> {
    assertDateKey(params.dateKey);
    const b = branchOid(params.branchId);

    // Traemos cuentas de la branch
    const accounts = await this.accountsService.findAll({
      branchId: params.branchId,
      active: undefined as any,
      includeDeleted: false,
      q: undefined,
      type: undefined as any,
    } as any);

    const baseMap = new Map<string, number>();
    const requiresClosingMap = new Map<string, boolean>();

    for (const a of accounts) {
      baseMap.set(a.id, Number(a.openingBalance ?? 0));
      requiresClosingMap.set(a.id, a.requiresClosing ?? true);
    }

    // Aggregate ledger moderno (FILTRADO POR BRANCH)
    const aggModern = await this.movementModel.aggregate([
      {
        $match: {
          branchId: b,
          status: { $ne: "VOID" },
          dateKey: { $lte: params.dateKey },
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
        $addFields: {
          signed: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$direction", FinanceMovementDirection.IN] },
                  then: "$amount",
                },
                {
                  case: { $eq: ["$direction", FinanceMovementDirection.OUT] },
                  then: { $multiply: ["$amount", -1] },
                },
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
          legacyTransfers: {
            $push: {
              type: "$type",
              amount: "$amount",
              toAccountId: "$toAccountId",
              direction: "$direction",
            },
          },
        },
      },
    ]);

    // Aplicar sumas modernas
    for (const r of aggModern) {
      const accId = r._id ? String(r._id) : null;
      if (!accId) continue;
      if (!baseMap.has(accId)) baseMap.set(accId, 0);
      baseMap.set(accId, (baseMap.get(accId) ?? 0) + Number(r.sumSigned ?? 0));
    }

    // Fallback legacy transfers (si faltaba direction)
    for (const r of aggModern) {
      const fromId = r._id ? String(r._id) : null;
      if (!fromId) continue;

      const legacy = Array.isArray(r.legacyTransfers) ? r.legacyTransfers : [];
      for (const m of legacy) {
        if (m?.type !== FinanceMovementType.TRANSFER) continue;
        if (m?.direction) continue;
        const amt = Number(m.amount ?? 0);
        const toId = m.toAccountId ? String(m.toAccountId) : null;

        baseMap.set(fromId, (baseMap.get(fromId) ?? 0) - amt);
        if (toId) {
          if (!baseMap.has(toId)) baseMap.set(toId, 0);
          baseMap.set(toId, (baseMap.get(toId) ?? 0) + amt);
        }
      }
    }

    // Solo requiresClosing=true
    const result: Array<{ accountId: Types.ObjectId; balance: number }> = [];
    for (const [id, bal] of baseMap.entries()) {
      if (!Types.ObjectId.isValid(id)) continue;

      const req = requiresClosingMap.get(id);
      if (req === false) continue;

      result.push({ accountId: new Types.ObjectId(id), balance: Number(bal ?? 0) });
    }

    return result;
  }

  private toDTO(row: any) {
    const mapRow = (r: any) => ({
      accountId: r.accountId ? String(r.accountId) : null,
      balance: Number(r.balance ?? 0),
    });

    return {
      id: String(row._id),
      branchId: row.branchId ? String(row.branchId) : null,

      dateKey: row.dateKey,
      status: row.status,
      notes: row.notes ?? null,

      declaredBalances: (row.declaredBalances || []).map(mapRow),
      computedBalances: (row.computedBalances || []).map(mapRow),
      diffBalances: (row.diffBalances || []).map(mapRow),

      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      submittedByUserId: row.submittedByUserId ? String(row.submittedByUserId) : null,
      lockedByUserId: row.lockedByUserId ? String(row.lockedByUserId) : null,
      submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : null,
      lockedAt: row.lockedAt ? new Date(row.lockedAt).toISOString() : null,

      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}
