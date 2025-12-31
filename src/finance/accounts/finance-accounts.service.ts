import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { CreateFinanceAccountDto } from "./dto/create-finance-account.dto";
import { UpdateFinanceAccountDto } from "./dto/update-finance-account.dto";
import { FinanceAccount, FinanceAccountDocument } from "./schemas/finance-account.schema";

function normCode(code: string) {
  const c = (code || "").trim().toLowerCase();
  // slug simple: letras/números/_/-
  const safe = c.replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  return safe;
}

function normCurrency(cur?: string) {
  const c = (cur || "ARS").trim().toUpperCase();
  return c || "ARS";
}

@Injectable()
export class FinanceAccountsService {
  constructor(
    @InjectModel(FinanceAccount.name)
    private readonly accountModel: Model<FinanceAccountDocument>,
  ) {}

  async create(userId: string, dto: CreateFinanceAccountDto) {
    const name = (dto.name || "").trim();
    if (!name) throw new BadRequestException("name is required");

    const code = normCode(dto.code);
    if (!code) throw new BadRequestException("code is required");

    const currency = normCurrency(dto.currency);

    const createdByUserId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : null;

    try {
      const created = await this.accountModel.create({
        code,
        name,
        type: dto.type,
        currency,
        openingBalance: dto.openingBalance ?? 0,
        requiresClosing: dto.requiresClosing ?? true,
        notes: dto.notes ?? null,
        isActive: true,
        createdByUserId,
        deletedAt: null,
      });

      return this.toDTO(created);
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        // puede venir por name o code
        throw new BadRequestException("Ya existe una cuenta con ese nombre o code");
      }
      throw e;
    }
  }

  async findAll(params: { active?: boolean; type?: string; q?: string; includeDeleted?: boolean }) {
    const filter: any = {};

    if (!params.includeDeleted) filter.deletedAt = null;
    if (typeof params.active === "boolean") filter.isActive = params.active;

    if (params.type) filter.type = params.type;

    if (params.q?.trim()) {
      const qq = params.q.trim();
      const esc = qq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: esc, $options: "i" } },
        { code: { $regex: esc, $options: "i" } },
      ];
    }

    const rows = await this.accountModel
      .find(filter)
      .collation({ locale: "en", strength: 2 })
      .sort({ type: 1, name: 1 })
      .lean();

    return rows.map((r) => this.toDTO(r));
  }

  async findOne(id: string) {
    const row = await this.accountModel.findById(id).lean();
    if (!row || row.deletedAt) throw new NotFoundException("Cuenta no encontrada");
    return this.toDTO(row);
  }

  async update(id: string, dto: UpdateFinanceAccountDto) {
    const row = await this.accountModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Cuenta no encontrada");

    if (dto.code !== undefined) {
      const code = normCode(dto.code);
      if (!code) throw new BadRequestException("code vacío");
      row.code = code;
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException("name vacío");
      row.name = name;
    }

    if (dto.type !== undefined) row.type = dto.type;

    if (dto.currency !== undefined) row.currency = normCurrency(dto.currency);

    if (dto.openingBalance !== undefined) row.openingBalance = dto.openingBalance;

    if (dto.requiresClosing !== undefined) row.requiresClosing = dto.requiresClosing;

    if (dto.isActive !== undefined) row.isActive = dto.isActive;

    if (dto.notes !== undefined) row.notes = dto.notes ?? null;

    try {
      await row.save();
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        throw new BadRequestException("Ya existe una cuenta con ese nombre o code");
      }
      throw e;
    }

    return this.toDTO(row.toObject());
  }

  async archive(id: string) {
    const row = await this.accountModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Cuenta no encontrada");

    row.isActive = false;
    await row.save();
    return { ok: true };
  }

  async restore(id: string) {
    const row = await this.accountModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Cuenta no encontrada");

    row.isActive = true;
    await row.save();
    return { ok: true };
  }

  async softDelete(id: string) {
    const row = await this.accountModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Cuenta no encontrada");

    row.isActive = false;
    row.deletedAt = new Date();
    await row.save();
    return { ok: true };
  }

  private toDTO(row: any) {
    return {
      id: String(row._id),
      code: row.code,
      name: row.name,
      type: row.type,
      currency: row.currency ?? "ARS",
      openingBalance: Number(row.openingBalance ?? 0),
      requiresClosing: row.requiresClosing ?? true,
      isActive: !!row.isActive,
      notes: row.notes ?? null,
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}
