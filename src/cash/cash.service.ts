import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CashDay,
  CashDayDocument,
  CashDayStatus,
} from './schemas/cash-day.schema';
import {
  CashMovement,
  CashMovementDocument,
  CashMovementType,
  PaymentMethod,
} from './schemas/cash-movement.schema';
import { OpenCashDayDto } from './dto/open-cash-day.dto';
import { CloseCashDayDto } from './dto/close-cash-day.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

function pickUserId(u: any) {
  return u?.id ?? u?._id ?? u?.userId ?? null;
}

function hasRole(u: any, role: string) {
  const roles = (u?.roles ?? []).map((r: any) => String(r).toUpperCase());
  return roles.includes(String(role).toUpperCase());
}

function toMoney(n: any) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

@Injectable()
export class CashService {
  constructor(
    @InjectModel(CashDay.name)
    private readonly cashDayModel: Model<CashDayDocument>,
    @InjectModel(CashMovement.name)
    private readonly movModel: Model<CashMovementDocument>,
  ) {}

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
      closeNote: d.closeNote ?? '',
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
      concept: m.concept ?? '',
      note: m.note ?? '',
      voided: !!m.voided,
      voidedAt: m.voidedAt ?? null,
      voidedByUserId: m.voidedByUserId ?? null,
      voidReason: m.voidReason ?? '',
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  // crea o trae la caja del día (1 por dateKey + branchId)
  async getOrCreateDay(user: any, dateKey: string, branchId?: string) {
    const bId = branchId ? new Types.ObjectId(branchId) : null;

    // upsert para evitar race conditions
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

    // recalcular expected (por si hay movimientos)
    const updated = await this.recalcExpectedCash(String(doc._id));
    return this.toCashDayPublic(updated);
  }

  async openDay(user: any, dto: OpenCashDayDto) {
    const bId = dto.branchId ? new Types.ObjectId(dto.branchId) : null;

    const existing = await this.cashDayModel.findOne({
      dateKey: dto.dateKey,
      branchId: bId,
    });
    if (existing) {
      // si ya existe, solo permitimos setear openingCash si sigue OPEN
      if (existing.status === CashDayStatus.CLOSED) {
        throw new BadRequestException('La caja de ese día ya está cerrada.');
      }
      const openingCash = Math.max(0, toMoney(dto.openingCash));
      const updated = await this.cashDayModel
        .findByIdAndUpdate(
          existing._id,
          { openingCash, openedAt: existing.openedAt ?? new Date() },
          { new: true },
        )
        .lean();

      const rec = await this.recalcExpectedCash(String(updated!._id));
      return this.toCashDayPublic(rec);
    }

    const openingCash = Math.max(0, toMoney(dto.openingCash));
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
    const userId = pickUserId(user);
    const isAdmin = hasRole(user, 'ADMIN');

    const bId = dto.branchId ? new Types.ObjectId(dto.branchId) : null;
    const day = await this.cashDayModel.findOne({
      dateKey: dto.dateKey,
      branchId: bId,
    });
    if (!day) throw new NotFoundException('Caja del día no encontrada.');

    if (day.status === CashDayStatus.CLOSED) {
      // si querés permitir re-cierre solo admin, se puede
      if (!isAdmin) throw new BadRequestException('La caja ya está cerrada.');
      // admin puede “re-cerrar” ajustando contado y nota
    }

    // recalcular expectedCash antes de cerrar
    const rec = await this.recalcExpectedCash(String(day._id));
    const expectedCash = toMoney(rec.expectedCash);

    // countedCash opcional, pero si no viene y no override -> error
    const countedCash =
      dto.countedCash === undefined || dto.countedCash === null
        ? null
        : Math.max(0, toMoney(dto.countedCash));

    const wantsOverride = !!dto.adminOverride;
    if (!countedCash && !wantsOverride) {
      throw new BadRequestException(
        'Falta countedCash para cerrar. (o usar adminOverride)',
      );
    }
    if (wantsOverride && !isAdmin) {
      throw new ForbiddenException('Solo ADMIN puede usar adminOverride.');
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
          closeNote: (dto.note ?? '').trim(),
        },
        { new: true },
      )
      .lean();

    return this.toCashDayPublic(updated);
  }

  // Admin-only (si querés reabrir caja cerrada)
  async reopenDay(
    user: any,
    dateKey: string,
    branchId?: string,
    note?: string,
  ) {
    if (!hasRole(user, 'ADMIN'))
      throw new ForbiddenException('Solo ADMIN puede reabrir caja.');

    const bId = branchId ? new Types.ObjectId(branchId) : null;
    const day = await this.cashDayModel.findOne({ dateKey, branchId: bId });
    if (!day) throw new NotFoundException('Caja del día no encontrada.');

    const updated = await this.cashDayModel
      .findByIdAndUpdate(
        day._id,
        {
          status: CashDayStatus.OPEN,
          closedAt: null,
          closedByUserId: null,
          countedCash: null,
          diffCash: 0,
          closeNote: (note ?? '').trim(),
        },
        { new: true },
      )
      .lean();

    const rec = await this.recalcExpectedCash(String(updated!._id));
    return this.toCashDayPublic(rec);
  }

  async listMovements(cashDayId: string) {
    const rows = await this.movModel
      .find({ cashDayId: new Types.ObjectId(cashDayId) })
      .sort({ createdAt: -1 })
      .lean();

    return rows.map((m) => this.toMovPublic(m));
  }

  async createMovement(user: any, dto: CreateMovementDto) {
    const cashDay = await this.cashDayModel.findById(dto.cashDayId);
    if (!cashDay) throw new NotFoundException('Caja no encontrada.');
    if (cashDay.status === CashDayStatus.CLOSED)
      throw new BadRequestException('La caja está cerrada.');

    const amount = Math.max(0, toMoney(dto.amount));
    if (amount <= 0) throw new BadRequestException('amount debe ser > 0');

    const categoryId = dto.categoryId
      ? new Types.ObjectId(dto.categoryId)
      : null;

    const doc = await this.movModel.create({
      cashDayId: new Types.ObjectId(dto.cashDayId),
      type: dto.type,
      method: dto.method,
      amount,
      categoryId,
      concept: (dto.concept ?? '').trim(),
      note: (dto.note ?? '').trim(),
      createdByUserId: pickUserId(user),
    });

    // recalcular expectedCash (solo impacta efectivo)
    await this.recalcExpectedCash(dto.cashDayId);

    return this.toMovPublic(doc);
  }

  async voidMovement(user: any, movementId: string, reason?: string) {
    const mov = await this.movModel.findById(movementId);
    if (!mov) throw new NotFoundException('Movimiento no encontrado.');

    const cashDay = await this.cashDayModel.findById(mov.cashDayId);
    if (!cashDay) throw new NotFoundException('Caja no encontrada.');
    if (cashDay.status === CashDayStatus.CLOSED) {
      if (!hasRole(user, 'ADMIN'))
        throw new BadRequestException('Caja cerrada: solo ADMIN puede anular.');
    }

    const updated = await this.movModel
      .findByIdAndUpdate(
        mov._id,
        {
          voided: true,
          voidedAt: new Date(),
          voidedByUserId: pickUserId(user),
          voidReason: (reason ?? '').trim(),
        },
        { new: true },
      )
      .lean();

    await this.recalcExpectedCash(String(cashDay._id));

    return this.toMovPublic(updated);
  }

  // expectedCash = openingCash + ingresos CASH - egresos CASH (sin voided)
  private async recalcExpectedCash(cashDayId: string) {
    const day = await this.cashDayModel.findById(cashDayId).lean();
    if (!day) throw new NotFoundException('Caja no encontrada.');

    const rows = await this.movModel
      .find({ cashDayId: new Types.ObjectId(cashDayId), voided: false })
      .lean();

    let cashDelta = 0;
    for (const m of rows) {
      if (m.method !== PaymentMethod.CASH) continue;
      const amt = toMoney(m.amount);
      if (m.type === CashMovementType.INCOME) cashDelta += amt;
      if (m.type === CashMovementType.EXPENSE) cashDelta -= amt;
    }

    const expectedCash = toMoney(day.openingCash) + cashDelta;

    const updated = await this.cashDayModel
      .findByIdAndUpdate(
        cashDayId,
        {
          expectedCash,
          diffCash:
            day.countedCash == null
              ? 0
              : toMoney(day.countedCash) - expectedCash,
        },
        { new: true },
      )
      .lean();

    return updated!;
  }

  async getDaySummary(user: any, dateKey: string) {
    // 1) get or create day (branchId null)
    const dayPublic = await this.getOrCreateDay(user, dateKey, undefined);

    // 2) ensure expectedCash is up to date
    const dayId = dayPublic.id;
    const recDay = await this.recalcExpectedCash(dayId);

    // 3) aggregate movements (non-voided)
    const cashDayObjectId = new Types.ObjectId(dayId);

    // Totales por método / tipo
    const byMethodAgg = await this.movModel.aggregate([
      { $match: { cashDayId: cashDayObjectId, voided: false } },
      {
        $group: {
          _id: { method: '$method', type: '$type' },
          total: { $sum: '$amount' },
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
        methodMap[method] = {
          method,
          income: 0,
          expense: 0,
          net: 0,
          countIncome: 0,
          countExpense: 0,
        };
      }

      if (type === CashMovementType.INCOME) {
        methodMap[method].income += Number(row.total || 0);
        methodMap[method].countIncome += Number(row.count || 0);
      } else {
        methodMap[method].expense += Number(row.total || 0);
        methodMap[method].countExpense += Number(row.count || 0);
      }

      methodMap[method].net =
        methodMap[method].income - methodMap[method].expense;
    }

    const byMethod = Object.values(methodMap).sort((a: any, b: any) =>
      String(a.method).localeCompare(String(b.method)),
    );

    // Totales por categoría (lookup a FinanceCategory)
    // ⚠️ Si tu colección se llama distinto, cambiá "financecategories"
    const byCategoryAgg = await this.movModel.aggregate([
      {
        $match: {
          cashDayId: cashDayObjectId,
          voided: false,
          categoryId: { $ne: null },
        },
      },
      {
        $group: {
          _id: { categoryId: '$categoryId', type: '$type' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'financecategories',
          localField: '_id.categoryId',
          foreignField: '_id',
          as: 'cat',
        },
      },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          categoryId: { $toString: '$_id.categoryId' },
          type: '$_id.type',
          total: 1,
          count: 1,
          categoryName: '$cat.name',
          categoryType: '$cat.type',
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
          name: row.categoryName ?? '—',
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

    // Totales globales del día (independiente del método)
    const totalIncome = byMethod.reduce(
      (acc: number, x: any) => acc + Number(x.income || 0),
      0,
    );
    const totalExpense = byMethod.reduce(
      (acc: number, x: any) => acc + Number(x.expense || 0),
      0,
    );
    const net = totalIncome - totalExpense;

    // Efectivo neto del día (solo CASH, útil para arqueo)
    const cashRow = byMethod.find((x: any) => x.method === PaymentMethod.CASH);
    const cashNet = cashRow ? Number(cashRow.net || 0) : 0;

    return {
      day: this.toCashDayPublic(recDay),
      totals: {
        income: totalIncome,
        expense: totalExpense,
        net,
        cashNet,
      },
      byMethod,
      byCategory,
    };
  }
}
