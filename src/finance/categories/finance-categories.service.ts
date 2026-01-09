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

function ensureBranchObjectId(branchId: string) {
  if (!branchId || !Types.ObjectId.isValid(branchId)) {
    throw new BadRequestException("branchId inválido");
  }
  return new Types.ObjectId(branchId);
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

  private async assertParentInSameBranchOrThrow(params: {
    branchId: Types.ObjectId;
    parentId: Types.ObjectId;
  }) {
    const parent = await this.categoryModel
      .findOne({
        _id: params.parentId,
        branchId: params.branchId,
        deletedAt: null,
      })
      .select({ _id: 1 })
      .lean();

    if (!parent) {
      throw new BadRequestException("parentId no existe en esta sucursal (o está borrado)");
    }
  }

  async create(params: { userId: string; branchId: string; dto: CreateFinanceCategoryDto }) {
    const { userId, branchId, dto } = params;

    const branchObjectId = ensureBranchObjectId(branchId);

    const name = (dto.name || "").trim();
    if (!name) throw new BadRequestException("name is required");

    const code = normCode(dto.code);
    if (!code) throw new BadRequestException("code is required");

    const parentId = parseObjectIdOrNull(dto.parentId ?? null);

    // ✅ validar parent dentro de la misma branch
    if (parentId instanceof Types.ObjectId) {
      await this.assertParentInSameBranchOrThrow({ branchId: branchObjectId, parentId });
    }

    const createdByUserId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;

    try {
      const created = await this.categoryModel.create({
        branchId: branchObjectId,
        code,
        name,
        type: dto.type,
        direction: dto.direction,
        parentId: parentId ?? null,
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
    branchId: string;
    type?: FinanceCategoryType;
    active?: boolean;
    parentId?: string | null;
    q?: string;
    includeDeleted?: boolean;
  }) {
    const filter: any = {};
    filter.branchId = ensureBranchObjectId(params.branchId);

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

    const rows = await this.categoryModel
      .find(filter)
      .collation({ locale: "en", strength: 2 })
      .sort({ order: 1, name: 1 })
      .lean();

    return rows.map((r) => this.toDTO(r));
  }

  async findOne(params: { branchId: string; id: string }) {
    const { branchId, id } = params;

    const row = await this.categoryModel
      .findOne({
        _id: id,
        branchId: ensureBranchObjectId(branchId),
      })
      .lean();

    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
    return this.toDTO(row);
  }

  async update(params: { branchId: string; id: string; dto: UpdateFinanceCategoryDto }) {
    const { branchId, id, dto } = params;

    const branchObjectId = ensureBranchObjectId(branchId);

    const row = await this.categoryModel.findOne({
      _id: id,
      branchId: branchObjectId,
    });

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

    if (dto.parentId !== undefined) {
      const nextParentId = parseObjectIdOrNull(dto.parentId) as any;

      // ✅ validar parent dentro de la misma branch
      if (nextParentId instanceof Types.ObjectId) {
        // opcional: evitar que sea su propio parent
        if (String(nextParentId) === String(row._id)) {
          throw new BadRequestException("parentId no puede ser la misma categoría");
        }
        await this.assertParentInSameBranchOrThrow({
          branchId: branchObjectId,
          parentId: nextParentId,
        });
      }

      row.parentId = nextParentId;
    }

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

  async archive(params: { branchId: string; id: string }) {
    const { branchId, id } = params;

    const row = await this.categoryModel.findOne({
      _id: id,
      branchId: ensureBranchObjectId(branchId),
    });

    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
    row.isActive = false;
    await row.save();
    return { ok: true };
  }

  async restore(params: { branchId: string; id: string }) {
    const { branchId, id } = params;

    const row = await this.categoryModel.findOne({
      _id: id,
      branchId: ensureBranchObjectId(branchId),
    });

    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
    row.isActive = true;
    await row.save();
    return { ok: true };
  }

  async softDelete(params: { branchId: string; id: string }) {
    const { branchId, id } = params;

    const row = await this.categoryModel.findOne({
      _id: id,
      branchId: ensureBranchObjectId(branchId),
    });

    if (!row || row.deletedAt) throw new NotFoundException("Categoría no encontrada");
    row.isActive = false;
    row.deletedAt = new Date();
    await row.save();
    return { ok: true };
  }

  private toDTO(row: any) {
    return {
      id: String(row._id),
      branchId: row.branchId ? String(row.branchId) : null,
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
