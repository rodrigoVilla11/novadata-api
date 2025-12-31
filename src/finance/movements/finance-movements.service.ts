import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import {
  FinanceMovement,
  FinanceMovementDocument,
  FinanceMovementDirection,
  FinanceMovementSource,
  FinanceMovementStatus,
  FinanceMovementType,
} from "./schemas/finance-movement.schema";

import { CreateFinanceMovementDto } from "./dto/create-finance-movement.dto";
import { UpdateFinanceMovementDto } from "./dto/update-finance-movement.dto";

import { FinanceAccountsService } from "../accounts/finance-accounts.service";
import { FinanceCategoriesService } from "../categories/finance-categories.service";

import {
  FinanceDayClosing,
  FinanceDayClosingDocument,
} from "../closings/schemas/finance-day-closing.schema";

function assertDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) {
    throw new BadRequestException("dateKey must be YYYY-MM-DD");
  }
}

function escRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

@Injectable()
export class FinanceMovementsService {
  constructor(
    @InjectModel(FinanceMovement.name)
    private readonly movementModel: Model<FinanceMovementDocument>,

    private readonly accountsService: FinanceAccountsService,
    private readonly categoriesService: FinanceCategoriesService,

    @InjectModel(FinanceDayClosing.name)
    private readonly closingModel: Model<FinanceDayClosingDocument>,
  ) {}

  // -----------------------------
  // Helpers
  // -----------------------------
  private oid(id: string, field: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException(`${field} inválido`);
    return new Types.ObjectId(id);
  }

  private isAdmin(roles: string[] | undefined | null) {
    return Array.isArray(roles) && roles.includes("ADMIN");
  }

  private async assertDayNotLocked(dateKey: string, roles?: string[]) {
    const closing = await this.closingModel.findOne({ dateKey }).lean();
    if (!closing) return;
    if (closing.status === "LOCKED" && !this.isAdmin(roles)) {
      throw new BadRequestException(
        `El día ${dateKey} está CERRADO (LOCKED). Solo ADMIN puede modificar movimientos.`,
      );
    }
  }

  private assertEditableBySource(row: any, roles?: string[]) {
    // Regla: si no es MANUAL, solo ADMIN puede editar/void
    const src = row?.source ?? "MANUAL";
    if (src !== "MANUAL" && !this.isAdmin(roles)) {
      throw new BadRequestException(
        `Este movimiento fue generado por el sistema (${src}). Solo ADMIN puede modificarlo.`,
      );
    }
  }

  private validateMovementInput(data: {
    dateKey?: string;
    direction?: FinanceMovementDirection;
    amount?: number;
    accountId?: string;
    toAccountId?: string | null;
    adjustmentSign?: 1 | -1;
  }) {
    if (data.dateKey !== undefined) assertDateKey(data.dateKey);

    if (!data.direction)
      throw new BadRequestException("direction requerido");

    if (data.amount !== undefined && !(Number(data.amount) >= 0)) {
      throw new BadRequestException("amount inválido");
    }

    if (data.direction === FinanceMovementDirection.TRANSFER) {
      if (!data.toAccountId)
        throw new BadRequestException("toAccountId requerido para TRANSFER");
      if (
        data.accountId &&
        data.toAccountId &&
        data.accountId === data.toAccountId
      ) {
        throw new BadRequestException(
          "TRANSFER: cuenta origen y destino no pueden ser iguales",
        );
      }
    }

    if (data.direction === FinanceMovementDirection.ADJUSTMENT) {
      const sign = data.adjustmentSign ?? 1;
      if (sign !== 1 && sign !== -1) {
        throw new BadRequestException("adjustmentSign inválido (1 o -1)");
      }
    }
  }

  private legacyTypeFromDirection(direction: FinanceMovementDirection): FinanceMovementType {
    if (direction === FinanceMovementDirection.IN) return FinanceMovementType.INCOME;
    if (direction === FinanceMovementDirection.OUT) return FinanceMovementType.EXPENSE;
    if (direction === FinanceMovementDirection.TRANSFER) return FinanceMovementType.TRANSFER;
    // ADJUSTMENT: mantenemos EXPENSE como “legacy” (solo compatibilidad)
    return FinanceMovementType.EXPENSE;
  }

  private async getSnapshots(params: {
    accountId: Types.ObjectId;
    categoryId?: Types.ObjectId | null;
  }) {
    const acc = await this.accountsService.findOne(String(params.accountId));
    const cat = params.categoryId
      ? await this.categoriesService.findOne(String(params.categoryId))
      : null;

    return {
      accountNameSnapshot: acc?.name ?? null,
      accountCodeSnapshot: (acc as any)?.code ?? null,
      categoryNameSnapshot: cat?.name ?? null,
      categoryCodeSnapshot: (cat as any)?.code ?? null,
    };
  }

  // -----------------------------
  // Create
  // -----------------------------
  async create(userId: string, roles: string[], dto: CreateFinanceMovementDto) {
    this.validateMovementInput({
      dateKey: dto.dateKey,
      direction: dto.direction,
      amount: dto.amount,
      accountId: dto.accountId,
      toAccountId: dto.toAccountId ?? null,
      adjustmentSign: (dto as any).adjustmentSign,
    });

    await this.assertDayNotLocked(dto.dateKey, roles);

    const accountId = this.oid(dto.accountId, "accountId");
    const toAccountId =
      dto.direction === FinanceMovementDirection.TRANSFER && dto.toAccountId
        ? this.oid(dto.toAccountId, "toAccountId")
        : null;

    const categoryId = dto.categoryId ? this.oid(dto.categoryId, "categoryId") : null;
    const providerId = dto.providerId ? this.oid(dto.providerId, "providerId") : null;

    const createdByUserId = this.oid(userId, "userId");
    const source: FinanceMovementSource = (dto.source ?? "MANUAL") as any;

    // 1) No TRANSFER: un asiento
    if (dto.direction !== FinanceMovementDirection.TRANSFER) {
      const snaps = await this.getSnapshots({ accountId, categoryId });

      const created = await this.movementModel.create({
        dateKey: dto.dateKey,
        type: this.legacyTypeFromDirection(dto.direction),
        direction: dto.direction,
        amount: dto.amount,
        adjustmentSign: dto.direction === FinanceMovementDirection.ADJUSTMENT ? ((dto as any).adjustmentSign ?? 1) : 1,
        accountId,
        toAccountId: null,
        transferGroupId: null,
        categoryId,
        providerId,
        notes: dto.notes ?? null,
        createdByUserId,
        status: "POSTED" as FinanceMovementStatus,
        source,
        sourceRef: dto.sourceRef ?? null,
        ...snaps,
      });

      return this.toDTO(created);
    }

    // 2) TRANSFER: dos asientos linkeados
    if (!toAccountId) throw new BadRequestException("toAccountId requerido para TRANSFER");

    const transferGroupId = new Types.ObjectId();

    // snapshots por cuenta
    const fromAcc = await this.accountsService.findOne(String(accountId));
    const toAcc = await this.accountsService.findOne(String(toAccountId));

    const docs = await this.movementModel.create([
      {
        dateKey: dto.dateKey,
        type: FinanceMovementType.TRANSFER,
        direction: FinanceMovementDirection.OUT,
        amount: dto.amount,
        adjustmentSign: 1,
        accountId,
        toAccountId,
        transferGroupId,
        categoryId: null, // transferencia no va a P&L
        providerId: null,
        notes: dto.notes ?? null,
        createdByUserId,
        status: "POSTED",
        source,
        sourceRef: dto.sourceRef ?? null,
        accountNameSnapshot: fromAcc?.name ?? null,
        accountCodeSnapshot: (fromAcc as any)?.code ?? null,
        categoryNameSnapshot: null,
        categoryCodeSnapshot: null,
      },
      {
        dateKey: dto.dateKey,
        type: FinanceMovementType.TRANSFER,
        direction: FinanceMovementDirection.IN,
        amount: dto.amount,
        adjustmentSign: 1,
        accountId: toAccountId,     // 👈 destino como cuenta del asiento
        toAccountId: accountId,     // opcional: para UI / trazabilidad
        transferGroupId,
        categoryId: null,
        providerId: null,
        notes: dto.notes ?? null,
        createdByUserId,
        status: "POSTED",
        source,
        sourceRef: dto.sourceRef ?? null,
        accountNameSnapshot: toAcc?.name ?? null,
        accountCodeSnapshot: (toAcc as any)?.code ?? null,
        categoryNameSnapshot: null,
        categoryCodeSnapshot: null,
      },
    ]);

    // Devolvemos una vista “compacta” (una transferencia)
    const outRow = docs[0];
    return this.toTransferDTO({
      transferGroupId,
      dateKey: dto.dateKey,
      amount: dto.amount,
      from: { id: String(accountId), name: fromAcc?.name ?? null, code: (fromAcc as any)?.code ?? null },
      to: { id: String(toAccountId), name: toAcc?.name ?? null, code: (toAcc as any)?.code ?? null },
      notes: dto.notes ?? null,
      status: "POSTED",
      createdByUserId: String(createdByUserId),
      createdAt: outRow?.createdAt,
      updatedAt: outRow?.updatedAt,
      source,
      sourceRef: dto.sourceRef ?? null,
    });
  }

  // -----------------------------
  // List (sin duplicar transferencias)
  // -----------------------------
  async findAll(params: {
    from?: string;
    to?: string;
    direction?: FinanceMovementDirection;
    type?: FinanceMovementType; // legacy support
    accountId?: string;
    categoryId?: string;
    q?: string;
    limit?: number;
    page?: number;
    includeVoids?: boolean;
    status?: "ALL" | "POSTED" | "VOID";
  }) {
    const filter: any = {};

    if (params.status && params.status !== "ALL") {
      filter.status = params.status;
    } else if (!params.includeVoids) {
      filter.status = { $ne: "VOID" };
    }

    if (params.from || params.to) {
      filter.dateKey = {};
      if (params.from) filter.dateKey.$gte = params.from;
      if (params.to) filter.dateKey.$lte = params.to;
    }

    if (params.direction) filter.direction = params.direction;
    if (params.type) filter.type = params.type;

    if (params.accountId) filter.accountId = this.oid(params.accountId, "accountId");
    if (params.categoryId) filter.categoryId = this.oid(params.categoryId, "categoryId");

    if (params.q?.trim()) {
      const qq = params.q.trim();
      const r = { $regex: escRegex(qq), $options: "i" };
      filter.$or = [{ notes: r }, { accountNameSnapshot: r }, { categoryNameSnapshot: r }, { accountCodeSnapshot: r }, { categoryCodeSnapshot: r }];
    }

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;

    // strategy:
    // - Traemos docs del page
    // - Compactamos TRANSFER por transferGroupId (usando OUT como representativo)
    // Esto evita duplicados sin meternos en aggregation complejo.
    const items = await this.movementModel
      .find(filter)
      .sort({ dateKey: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // total: contar documentos sin compactar (lo dejamos simple por ahora)
    // Si querés total "compactado", lo hacemos con aggregation.
    const total = await this.movementModel.countDocuments(filter);

    // Compactación: para transferencias, quedarnos con el OUT por transferGroupId
    const seenTransfer = new Set<string>();
    const normalized: any[] = [];

    for (const it of items) {
      if (it.type === "TRANSFER" && it.transferGroupId) {
        const gid = String(it.transferGroupId);
        if (seenTransfer.has(gid)) continue;
        if (it.direction !== "OUT") continue; // elegimos OUT como “representante”
        seenTransfer.add(gid);

        // intentamos buscar el IN dentro del mismo page (si está)
        const inRow = items.find(
          (x) => String(x.transferGroupId) === gid && x.direction === "IN",
        );

        normalized.push(
          this.toTransferDTO({
            transferGroupId: it.transferGroupId,
            dateKey: it.dateKey,
            amount: Number(it.amount ?? 0),
            from: { id: String(it.accountId), name: it.accountNameSnapshot ?? null, code: it.accountCodeSnapshot ?? null },
            to: { id: inRow ? String(inRow.accountId) : (it.toAccountId ? String(it.toAccountId) : null), name: inRow?.accountNameSnapshot ?? null, code: inRow?.accountCodeSnapshot ?? null },
            notes: it.notes ?? null,
            status: it.status ?? "POSTED",
            createdByUserId: it.createdByUserId ? String(it.createdByUserId) : null,
            createdAt: it.createdAt,
            updatedAt: it.updatedAt,
            source: it.source ?? "MANUAL",
            sourceRef: it.sourceRef ?? null,
          }),
        );
      } else {
        normalized.push(this.toDTO(it));
      }
    }

    return { items: normalized, page, limit, total };
  }

  // -----------------------------
  // FindOne
  // -----------------------------
  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException("id inválido");
    const row = await this.movementModel.findById(id).lean();
    if (!row) throw new NotFoundException("Movimiento no encontrado");
    return this.toDTO(row);
  }

  // -----------------------------
  // Update
  // -----------------------------
  async update(id: string, roles: string[], dto: UpdateFinanceMovementDto) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException("id inválido");

    const row = await this.movementModel.findById(id);
    if (!row) throw new NotFoundException("Movimiento no encontrado");

    // LOCKED
    const nextDateKey = dto.dateKey ?? row.dateKey;
    await this.assertDayNotLocked(row.dateKey, roles);
    await this.assertDayNotLocked(nextDateKey, roles);

    // no editar movimientos sistema si no sos admin
    this.assertEditableBySource(row, roles);

    const nextDirection = (dto as any).direction ?? row.direction;
    const nextAccountId = dto.accountId ?? String(row.accountId);
    const nextToAccountId =
      dto.toAccountId !== undefined
        ? dto.toAccountId
        : row.toAccountId
          ? String(row.toAccountId)
          : null;

    this.validateMovementInput({
      dateKey: dto.dateKey ?? row.dateKey,
      direction: nextDirection,
      amount: dto.amount ?? row.amount,
      accountId: nextAccountId,
      toAccountId: nextToAccountId,
      adjustmentSign: (dto as any).adjustmentSign ?? row.adjustmentSign,
    });

    // Bloqueo: no permitimos convertir un asiento a TRANSFER vía update (se hace void + create)
    if (row.type === "TRANSFER" || nextDirection === FinanceMovementDirection.TRANSFER) {
      throw new BadRequestException("No se puede editar una TRANSFER. Hacé VOID y creá otra.");
    }

    if (dto.dateKey !== undefined) row.dateKey = dto.dateKey;

    if ((dto as any).direction !== undefined) {
      row.direction = (dto as any).direction;
      row.type = this.legacyTypeFromDirection((dto as any).direction);
    }

    if (dto.amount !== undefined) row.amount = dto.amount;

    if ((dto as any).adjustmentSign !== undefined) row.adjustmentSign = (dto as any).adjustmentSign;

    if (dto.accountId !== undefined) row.accountId = this.oid(dto.accountId, "accountId");

    if (dto.categoryId !== undefined) {
      row.categoryId = dto.categoryId ? this.oid(dto.categoryId, "categoryId") : null;
    }

    if (dto.providerId !== undefined) {
      row.providerId = dto.providerId ? this.oid(dto.providerId, "providerId") : null;
    }

    if (dto.notes !== undefined) row.notes = dto.notes ?? null;

    if (dto.status !== undefined) row.status = dto.status as FinanceMovementStatus;

    // refrescar snapshots si cambió account/category
    if (dto.accountId !== undefined || dto.categoryId !== undefined) {
      const snaps = await this.getSnapshots({
        accountId: row.accountId,
        categoryId: row.categoryId ?? null,
      });
      row.accountNameSnapshot = snaps.accountNameSnapshot;
      row.accountCodeSnapshot = snaps.accountCodeSnapshot;
      row.categoryNameSnapshot = snaps.categoryNameSnapshot;
      row.categoryCodeSnapshot = snaps.categoryCodeSnapshot;
    }

    await row.save();
    return this.toDTO(row.toObject());
  }

  // -----------------------------
  // Void
  // -----------------------------
  async void(id: string, roles: string[]) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException("id inválido");
    const row = await this.movementModel.findById(id);
    if (!row) throw new NotFoundException("Movimiento no encontrado");

    await this.assertDayNotLocked(row.dateKey, roles);
    this.assertEditableBySource(row, roles);

    // Si es parte de una transferencia, void ambos asientos
    if (row.type === "TRANSFER" && row.transferGroupId) {
      await this.movementModel.updateMany(
        { transferGroupId: row.transferGroupId },
        { $set: { status: "VOID" } },
      );
      return { ok: true };
    }

    row.status = "VOID";
    await row.save();
    return { ok: true };
  }

  // -----------------------------
  // DTO mappers
  // -----------------------------
  private toTransferDTO(p: {
    transferGroupId: Types.ObjectId;
    dateKey: string;
    amount: number;
    from: { id: string | null; name: string | null; code: string | null };
    to: { id: string | null; name: string | null; code: string | null };
    notes: string | null;
    status: FinanceMovementStatus;
    createdByUserId: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    source: FinanceMovementSource;
    sourceRef: string | null;
  }) {
    return {
      id: String(p.transferGroupId), // 👈 para UI es el “id” de la transferencia
      transferGroupId: String(p.transferGroupId),
      dateKey: p.dateKey,
      type: "TRANSFER",
      direction: "TRANSFER",
      amount: Number(p.amount ?? 0),
      accountId: p.from.id,
      toAccountId: p.to.id,
      fromAccount: p.from,
      toAccount: p.to,
      categoryId: null,
      providerId: null,
      notes: p.notes,
      status: p.status,
      source: p.source,
      sourceRef: p.sourceRef,
      createdByUserId: p.createdByUserId,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
    };
  }

  private toDTO(row: any) {
    return {
      id: String(row._id),
      dateKey: row.dateKey,
      type: row.type,
      direction: row.direction,
      amount: Number(row.amount ?? 0),
      adjustmentSign: row.adjustmentSign ?? 1,
      accountId: row.accountId ? String(row.accountId) : null,
      toAccountId: row.toAccountId ? String(row.toAccountId) : null,
      transferGroupId: row.transferGroupId ? String(row.transferGroupId) : null,
      categoryId: row.categoryId ? String(row.categoryId) : null,
      providerId: row.providerId ? String(row.providerId) : null,
      notes: row.notes ?? null,
      status: (row.status ?? "POSTED") as FinanceMovementStatus,
      source: (row.source ?? "MANUAL") as FinanceMovementSource,
      sourceRef: row.sourceRef ?? null,
      accountNameSnapshot: row.accountNameSnapshot ?? null,
      accountCodeSnapshot: row.accountCodeSnapshot ?? null,
      categoryNameSnapshot: row.categoryNameSnapshot ?? null,
      categoryCodeSnapshot: row.categoryCodeSnapshot ?? null,
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}
