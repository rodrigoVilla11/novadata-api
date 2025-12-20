import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CreateFinanceAccountDto } from "./dto/create-finance-account.dto";
import { UpdateFinanceAccountDto } from "./dto/update-finance-account.dto";
import { FinanceAccount, FinanceAccountDocument } from "./schemas/finance-account.schema";

@Injectable()
export class FinanceAccountsService {
  constructor(
    @InjectModel(FinanceAccount.name)
    private readonly accountModel: Model<FinanceAccountDocument>,
  ) {}

  async create(userId: string, dto: CreateFinanceAccountDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("name is required");

    const currency = (dto.currency || "ARS").trim().toUpperCase();

    try {
      const created = await this.accountModel.create({
        name,
        type: dto.type,
        currency,
        openingBalance: dto.openingBalance ?? 0,
        notes: dto.notes ?? null,
        isActive: true,
        createdByUserId: userId || null,
        deletedAt: null,
      });

      return this.toDTO(created);
    } catch (e: any) {
      // duplicate key
      if (String(e?.code) === "11000") {
        throw new BadRequestException("Ya existe una cuenta con ese nombre");
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
      filter.name = { $regex: qq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
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

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException("name vacío");
      row.name = name;
    }

    if (dto.type !== undefined) row.type = dto.type;

    if (dto.currency !== undefined) row.currency = dto.currency.trim().toUpperCase() || "ARS";

    if (dto.openingBalance !== undefined) row.openingBalance = dto.openingBalance;

    if (dto.isActive !== undefined) row.isActive = dto.isActive;

    if (dto.notes !== undefined) row.notes = dto.notes ?? null;

    try {
      await row.save();
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        throw new BadRequestException("Ya existe una cuenta con ese nombre");
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
      name: row.name,
      type: row.type,
      currency: row.currency ?? "ARS",
      openingBalance: Number(row.openingBalance ?? 0),
      isActive: !!row.isActive,
      notes: row.notes ?? null,
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}
