import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  FinanceCategory,
  FinanceCategoryDocument,
  FinanceCategoryType,
} from "./schemas/finance-category.schema";
import { CreateFinanceCategoryDto } from "./dto/create-finance-category.dto";
import { UpdateFinanceCategoryDto } from "./dto/update-finance-category.dto";

function normCode(code: string) {
  const c = (code || "").trim().toLowerCase();
  return c.replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
}

function parseObjectIdOrNull(v?: string | null) {
  if (v === undefined) return undefined; // means "no filter / no change"
  if (v === null || v === "" || v === "null") return null;
  if (!Types.ObjectId.isValid(v)) throw new BadRequestException("parentId inválido");
  return new Types.ObjectId(v);
}

@Injectable()
export class FinanceCategoriesService {
  constructor(
    @InjectModel(FinanceCategory.name)
    private readonly categoryModel: Model<FinanceCategoryDocument>,
  ) {}

  async create(userId: string, dto: CreateFinanceCategoryDto) {
    const name = (dto.name || "").trim();
    if (!name) throw new BadRequestException("name is required");

    const code = normCode(dto.code);
    if (!code) throw new BadRequestException("code is required");

    const parentId = parseObjectIdOrNull(dto.parentId ?? null);

    const createdByUserId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;

    try {
      const created = await this.categoryModel.create({
        code,
        name,
        type: dto.type,
        direction: dto.direction,
        parentId,
        order: dto.order ?? 0,
        isActive: true,
        affectsProfit: dto.affectsProfit ?? true,
        includeInStats: dto.includeInStats ?? true,
        createdByUserId,
        deletedAt: null,
      });

      return this.toDTO(created);
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        throw new BadRequestException("Ya existe una categoría con ese code o nombre en ese nivel");
      }
      throw e;
    }
  }

  async findAll(params: {
    type?: FinanceCategoryType;
    active?: boolean;
    parentId?: string | null;
    q?: string;
    includeDeleted?: boolean;
  }) {
    const filter: any = {};
    if (!params.includeDeleted) filter.deletedAt = null;
    if (params.type) filter.type = params.type;
    if (typeof params.active === "boolean") filter.isActive = params.active;

    if (params.parentId !== undefined) {
      filter.parentId = parseObjectIdOrNull(params.parentId);
    }

    if (params.q?.trim()) {
      const qq = params.q.trim();
      const esc = qq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: esc, $options: "i" } },
        { code: { $regex: esc, $options: "i" } },
      ];
    }

    const rows = await this.categoryModel.find(filter).sort({ order: 1, name: 1 }).lean();
    return rows.map((r) => this.toDTO(r));
  }

  async findOne(id: string) {
    const row = await this.categoryModel.findById(id).lean();
    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
    return this.toDTO(row);
  }

  async update(id: string, dto: UpdateFinanceCategoryDto) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");

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
    if (dto.direction !== undefined) row.direction = dto.direction;

    if (dto.parentId !== undefined) row.parentId = parseObjectIdOrNull(dto.parentId) as any;

    if (dto.order !== undefined) row.order = dto.order;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.affectsProfit !== undefined) row.affectsProfit = dto.affectsProfit;
    if (dto.includeInStats !== undefined) row.includeInStats = dto.includeInStats;

    try {
      await row.save();
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        throw new BadRequestException("Ya existe una categoría con ese code o nombre en ese nivel");
      }
      throw e;
    }

    return this.toDTO(row.toObject());
  }

  async archive(id: string) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
    row.isActive = false;
    await row.save();
    return { ok: true };
  }

  async restore(id: string) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
    row.isActive = true;
    await row.save();
    return { ok: true };
  }

  async softDelete(id: string) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
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
      direction: row.direction,
      parentId: row.parentId ?? null,
      order: row.order ?? 0,
      isActive: !!row.isActive,
      affectsProfit: row.affectsProfit ?? true,
      includeInStats: row.includeInStats ?? true,
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}
