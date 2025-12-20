import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { FinanceAccountsService } from "../accounts/finance-accounts.service";
import {
  FinanceDayClosing,
  FinanceDayClosingDocument,
} from "./schemas/finance-day-closing.schema";
import { UpsertDayClosingDto } from "./dto/upsert-day-closing.dto";
import { FinanceMovement, FinanceMovementDocument, FinanceMovementType } from "../movements/schemas/finance-movement.schema";
import { InjectModel as InjectModel2 } from "@nestjs/mongoose";

function isValidDateKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

@Injectable()
export class FinanceClosingsService {
  constructor(
    @InjectModel(FinanceDayClosing.name)
    private readonly closingModel: Model<FinanceDayClosingDocument>,

    // Movements
    @InjectModel2(FinanceMovement.name)
    private readonly movementModel: Model<FinanceMovementDocument>,

    // Accounts (para traer openingBalance y lista de cuentas)
    private readonly accountsService: FinanceAccountsService,
  ) {}

  private oid(id: string, field: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`${field} inválido`);
    return new Types.ObjectId(id);
  }

  private normBalances(input: Array<{ accountId: string; balance: number }>) {
    // dedupe por accountId (si el front manda repetidos)
    const map = new Map<string, number>();
    for (const r of input || []) {
      const k = String(r.accountId);
      const v = Number(r.balance ?? 0);
      map.set(k, v);
    }
    return [...map.entries()].map(([accountId, balance]) => ({ accountId, balance }));
  }

  async getOrCreate(dateKey: string, userId?: string) {
    if (!isValidDateKey(dateKey)) throw new BadRequestException("dateKey inválido");
    let row = await this.closingModel.findOne({ dateKey });
    if (!row) {
      row = await this.closingModel.create({
        dateKey,
        status: "OPEN",
        declaredBalances: [],
        computedBalances: [],
        diffBalances: [],
        notes: null,
        createdByUserId: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null,
        submittedByUserId: null,
        lockedByUserId: null,
        submittedAt: null,
        lockedAt: null,
      });
    }
    return row;
  }

  async getOne(dateKey: string) {
    const row = await this.closingModel.findOne({ dateKey }).lean();
    if (!row) throw new NotFoundException("Cierre no encontrado");
    return this.toDTO(row);
  }

  async upsertDeclared(dateKey: string, userId: string, dto: UpsertDayClosingDto) {
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
    const closing = await this.getOrCreate(dateKey, userId);

    if (closing.status === "LOCKED") {
      throw new BadRequestException("El cierre está LOCKED y no se puede enviar");
    }

    const computed = await this.computeBalancesUpTo(dateKey);

    // computed map
    const computedMap = new Map<string, number>();
    for (const c of computed) computedMap.set(String(c.accountId), c.balance);

    // declared map
    const declaredMap = new Map<string, number>();
    for (const d of closing.declaredBalances || []) {
      declaredMap.set(String(d.accountId), Number(d.balance ?? 0));
    }

    // diffs solo para cuentas declaradas (así no te obliga a declarar todas)
    const diffs: Array<{ accountId: Types.ObjectId; balance: number }> = [];
    for (const [accIdStr, declaredBal] of declaredMap.entries()) {
      const comp = computedMap.get(accIdStr) ?? 0;
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
   * Calcula saldo final computado por cuenta hasta dateKey inclusive.
   * Fórmula:
   * openingBalance + Σ incomes - Σ expenses + Σ transfersIn - Σ transfersOut
   *
   * Nota: solo considera movimientos status != VOID.
   */
  async computeBalancesUpTo(dateKey: string): Promise<Array<{ accountId: Types.ObjectId; balance: number }>> {
    // Traigo cuentas activas (y también inactivas si querés seguir trackeando):
    // para caja conviene incluir todas las que existan (aunque estén inactive)
    const accounts = await this.accountsService.findAll({ active: undefined as any, includeDeleted: false } as any);

    // base map con openingBalance
    const baseMap = new Map<string, number>();
    for (const a of accounts) {
      baseMap.set(a.id, Number(a.openingBalance ?? 0));
    }

    // aggregate movements hasta dateKey inclusive
    const rows = await this.movementModel.aggregate([
      {
        $match: {
          status: { $ne: "VOID" },
          dateKey: { $lte: dateKey },
        },
      },
      {
        $project: {
          accountId: 1,
          toAccountId: 1,
          type: 1,
          amount: 1,
        },
      },
    ]);

    // acumular
    for (const r of rows) {
      const type: FinanceMovementType = r.type;
      const amount = Number(r.amount ?? 0);

      const accId = r.accountId ? String(r.accountId) : null;
      const toId = r.toAccountId ? String(r.toAccountId) : null;

      if (!accId) continue;

      // ensure keys exist
      if (!baseMap.has(accId)) baseMap.set(accId, 0);
      if (toId && !baseMap.has(toId)) baseMap.set(toId, 0);

      if (type === "INCOME") {
        baseMap.set(accId, (baseMap.get(accId) ?? 0) + amount);
      } else if (type === "EXPENSE") {
        baseMap.set(accId, (baseMap.get(accId) ?? 0) - amount);
      } else if (type === "TRANSFER") {
        // out
        baseMap.set(accId, (baseMap.get(accId) ?? 0) - amount);
        // in
        if (toId) baseMap.set(toId, (baseMap.get(toId) ?? 0) + amount);
      }
    }

    // devolver balances ordenados por cuenta (tipo + nombre) usando accounts list
    const result: Array<{ accountId: Types.ObjectId; balance: number }> = [];

    for (const [id, bal] of baseMap.entries()) {
      if (!Types.ObjectId.isValid(id)) continue;
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
