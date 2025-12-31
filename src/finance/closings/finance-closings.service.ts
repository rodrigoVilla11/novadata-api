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

  async getOrCreate(dateKey: string, userId?: string) {
    assertDateKey(dateKey);

    let row = await this.closingModel.findOne({ dateKey });
    if (!row) {
      row = await this.closingModel.create({
        dateKey,
        status: "OPEN",
        declaredBalances: [],
        computedBalances: [],
        diffBalances: [],
        notes: null,
        createdByUserId:
          userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null,
        submittedByUserId: null,
        lockedByUserId: null,
        submittedAt: null,
        lockedAt: null,
      });
    }
    return row;
  }

  async getOne(dateKey: string) {
    assertDateKey(dateKey);
    const row = await this.closingModel.findOne({ dateKey }).lean();
    if (!row) throw new NotFoundException("Cierre no encontrado");
    return this.toDTO(row);
  }

  async upsertDeclared(dateKey: string, userId: string, dto: UpsertDayClosingDto) {
    assertDateKey(dateKey);
    const closing = await this.getOrCreate(dateKey, userId);

    if (closing.status === "LOCKED") {
      throw new BadRequestException("El cierre está LOCKED y no se puede editar");
    }

    const declaredNorm = this.normBalances(dto.declaredBalances || []);

    closing.declaredBalances = declaredNorm.map((r) => ({
      accountId: this.oid(r.accountId, "accountId"),
      balance: Number(r.balance ?? 0),
    })) as any;

    if (dto.notes !== undefined) closing.notes = dto.notes ?? null;

    await closing.save();
    return this.toDTO(closing.toObject());
  }

  async submit(dateKey: string, userId: string) {
    assertDateKey(dateKey);
    const closing = await this.getOrCreate(dateKey, userId);

    if (closing.status === "LOCKED") {
      throw new BadRequestException("El cierre está LOCKED y no se puede enviar");
    }

    // 1) computed usando ledger (incluye openingBalance)
    const computed = await this.computeBalancesUpTo(dateKey);

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
    closing.submittedByUserId = this.oid(userId, "userId");

    await closing.save();
    return this.toDTO(closing.toObject());
  }

  async lock(dateKey: string, adminUserId: string) {
    assertDateKey(dateKey);
    const closing = await this.getOrCreate(dateKey, adminUserId);

    if (closing.status !== "SUBMITTED") {
      throw new BadRequestException("Solo se puede LOCKEAR un cierre SUBMITTED");
    }

    closing.status = "LOCKED";
    closing.lockedAt = new Date();
    closing.lockedByUserId = this.oid(adminUserId, "userId");
    await closing.save();

    return this.toDTO(closing.toObject());
  }

  /**
   * Calcula saldos por cuenta hasta dateKey inclusive:
   * openingBalance + Σ signedMovement
   *
   * signedMovement:
   * - direction IN  => +amount
   * - direction OUT => -amount
   * - direction ADJUSTMENT => adjustmentSign * amount (default +)
   *
   * TRANSFER:
   * - Si tu sistema ya guarda 2 asientos (OUT e IN), entra natural por direction.
   * - Si todavía existe data legacy con type=TRANSFER + toAccountId, aplicamos fallback.
   */
  async computeBalancesUpTo(dateKey: string): Promise<Array<{ accountId: Types.ObjectId; balance: number }>> {
    assertDateKey(dateKey);

    // Traemos cuentas (incluye requiresClosing)
    const accounts = await this.accountsService.findAll({
      active: undefined as any,
      includeDeleted: false,
      q: undefined,
      type: undefined as any,
    } as any);

    // Base con openingBalance
    const baseMap = new Map<string, number>();
    const requiresClosingMap = new Map<string, boolean>();

    for (const a of accounts) {
      baseMap.set(a.id, Number(a.openingBalance ?? 0));
      requiresClosingMap.set(a.id, a.requiresClosing ?? true);
    }

    // Aggregate ledger moderno: agrupar por accountId
    const aggModern = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          dateKey: { $lte: dateKey },
          // usa direction si existe; si no existe (legacy), igual pasa y lo cubrimos luego
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
              default: null, // legacy or missing direction
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

    // Fallback legacy transfers: type=TRANSFER con toAccountId (solo si faltaba direction)
    // Esto evita doble conteo: solo aplica si direction es null/undefined en ese doc.
    // Como en aggregation agrupamos, tenemos que recorrer legacyTransfers.
    for (const r of aggModern) {
      const fromId = r._id ? String(r._id) : null;
      if (!fromId) continue;

      const legacy = Array.isArray(r.legacyTransfers) ? r.legacyTransfers : [];
      for (const m of legacy) {
        if (m?.type !== FinanceMovementType.TRANSFER) continue;
        if (m?.direction) continue; // si ya tiene direction, NO es legacy
        const amt = Number(m.amount ?? 0);
        const toId = m.toAccountId ? String(m.toAccountId) : null;

        // salida
        baseMap.set(fromId, (baseMap.get(fromId) ?? 0) - amt);
        // entrada
        if (toId) {
          if (!baseMap.has(toId)) baseMap.set(toId, 0);
          baseMap.set(toId, (baseMap.get(toId) ?? 0) + amt);
        }
      }
    }

    // 🔑 Importante: por defecto, para cierre usamos solo requiresClosing=true
    // (pero si el cashier declaró una cuenta no-arqueable, igual aparece en diffs por declaredBalances)
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
