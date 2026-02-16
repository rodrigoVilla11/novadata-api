import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  FinanceCategory,
  FinanceCategoryDocument,
  FinanceCategoryType,
  FinanceCategoryDirection,
} from "./schemas/finance-category.schema";
import { CreateFinanceCategoryDto } from "./dto/create-finance-category.dto";
import { UpdateFinanceCategoryDto } from "./dto/update-finance-category.dto";
import { 
  FinanceCategoryResponseDto,
  FinanceCategoryTreeResponseDto,
} from "./dto/finance-category-response.dto";

// =====================
// HELPERS
// =====================

function normCode(code: string): string {
  const c = (code || "").trim().toLowerCase();
  const safe = c.replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  
  if (!safe) {
    throw new BadRequestException("El código contiene solo caracteres inválidos");
  }
  
  return safe;
}

function ensureBranchObjectId(branchId: string): Types.ObjectId {
  if (!branchId || !Types.ObjectId.isValid(branchId)) {
    throw new BadRequestException("branchId inválido");
  }
  return new Types.ObjectId(branchId);
}

function ensureValidObjectId(id: string, fieldName: string = "ID"): void {
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`${fieldName} inválido`);
  }
}

function parseObjectIdOrNull(v?: string | null): Types.ObjectId | null | undefined {
  if (v === undefined) return undefined; // No filter / no change
  if (v === null || v === "" || v === "null") return null;
  if (!Types.ObjectId.isValid(v)) {
    throw new BadRequestException("parentId inválido");
  }
  return new Types.ObjectId(v);
}

// =====================
// SERVICE
// =====================

@Injectable()
export class FinanceCategoriesService {
  constructor(
    @InjectModel(FinanceCategory.name)
    private readonly categoryModel: Model<FinanceCategoryDocument>,
  ) {}

  async create(params: {
    userId: string;
    branchId: string;
    dto: CreateFinanceCategoryDto;
  }): Promise<FinanceCategoryResponseDto> {
    const { userId, branchId, dto } = params;

    const branchObjectId = ensureBranchObjectId(branchId);

    // Validaciones
    const name = (dto.name || "").trim();
    if (!name) {
      throw new BadRequestException("El nombre es requerido");
    }

    const code = normCode(dto.code);
    if (!code) {
      throw new BadRequestException("El código es requerido");
    }

    const parentId = parseObjectIdOrNull(dto.parentId ?? null);

    // Validar parent en la misma branch
    if (parentId instanceof Types.ObjectId) {
      await this.assertParentInSameBranchOrThrow({ 
        branchId: branchObjectId, 
        parentId 
      });
    }

    const createdByUserId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : null;

    // Validar unicidad de código
    const existingByCode = await this.categoryModel.findOne({
      branchId: branchObjectId,
      code,
      deletedAt: null,
    });

    if (existingByCode) {
      throw new BadRequestException(
        `Ya existe una categoría con el código "${code}" en esta sucursal`
      );
    }

    // Validar unicidad de nombre en mismo parent/direction
    const existingByName = await this.categoryModel.findOne({
      branchId: branchObjectId,
      parentId: parentId ?? null,
      direction: dto.direction,
      name,
      deletedAt: null,
    });

    if (existingByName) {
      throw new BadRequestException(
        `Ya existe una categoría con el nombre "${name}" en este nivel y dirección`
      );
    }

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
        throw new BadRequestException(
          "Ya existe una categoría con ese código o nombre en ese nivel"
        );
      }
      throw e;
    }
  }

  async findAll(params: {
    branchId: string;
    type?: FinanceCategoryType;
    direction?: FinanceCategoryDirection;
    active?: boolean;
    parentId?: string | null;
    includeInStats?: boolean;
    affectsProfit?: boolean;
    q?: string;
    includeDeleted?: boolean;
  }): Promise<FinanceCategoryResponseDto[]> {
    const filter: any = {};
    filter.branchId = ensureBranchObjectId(params.branchId);

    if (!params.includeDeleted) {
      filter.deletedAt = null;
    }

    if (params.type) {
      filter.type = params.type;
    }

    if (params.direction) {
      filter.direction = params.direction;
    }

    if (typeof params.active === "boolean") {
      filter.isActive = params.active;
    }

    if (typeof params.includeInStats === "boolean") {
      filter.includeInStats = params.includeInStats;
    }

    if (typeof params.affectsProfit === "boolean") {
      filter.affectsProfit = params.affectsProfit;
    }

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

  async findOne(params: { branchId: string; id: string }): Promise<FinanceCategoryResponseDto> {
    const { branchId, id } = params;

    ensureValidObjectId(id, "ID de categoría");

    const row = await this.categoryModel
      .findOne({
        _id: id,
        branchId: ensureBranchObjectId(branchId),
        deletedAt: null,
      })
      .lean();

    if (!row) {
      throw new NotFoundException("Categoría no encontrada");
    }

    return this.toDTO(row);
  }

  async update(params: {
    branchId: string;
    id: string;
    dto: UpdateFinanceCategoryDto;
  }): Promise<FinanceCategoryResponseDto> {
    const { branchId, id, dto } = params;

    const row = await this.findCategoryOrThrow(branchId, id);

    // Validar unicidad de code si cambió
    if (dto.code !== undefined) {
      const code = normCode(dto.code);
      if (!code) {
        throw new BadRequestException("El código no puede estar vacío");
      }

      if (code !== row.code) {
        const existing = await this.categoryModel.findOne({
          branchId: row.branchId,
          code,
          deletedAt: null,
          _id: { $ne: row._id },
        });

        if (existing) {
          throw new BadRequestException(
            `Ya existe una categoría con el código "${code}" en esta sucursal`
          );
        }
      }

      row.code = code;
    }

    // Validar unicidad de name si cambió
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("El nombre no puede estar vacío");
      }

      const newDirection = dto.direction ?? row.direction;
      const newParentId = dto.parentId !== undefined
        ? parseObjectIdOrNull(dto.parentId)
        : row.parentId;

      // Solo validar si cambió algo relevante
      const relevantChange =
        name !== row.name ||
        newDirection !== row.direction ||
        String(newParentId) !== String(row.parentId);

      if (relevantChange) {
        const existing = await this.categoryModel.findOne({
          branchId: row.branchId,
          parentId: newParentId ?? null,
          direction: newDirection,
          name,
          deletedAt: null,
          _id: { $ne: row._id },
        });

        if (existing) {
          throw new BadRequestException(
            `Ya existe una categoría con el nombre "${name}" en este nivel y dirección`
          );
        }
      }

      row.name = name;
    }

    if (dto.type !== undefined) {
      row.type = dto.type;
    }

    if (dto.direction !== undefined) {
      row.direction = dto.direction;
    }

    if (dto.parentId !== undefined) {
      const nextParentId = parseObjectIdOrNull(dto.parentId);

      if (nextParentId instanceof Types.ObjectId) {
        // Evitar que sea su propio padre
        if (String(nextParentId) === String(row._id)) {
          throw new BadRequestException(
            "Una categoría no puede ser su propio padre"
          );
        }

        // Validar que el parent exista
        await this.assertParentInSameBranchOrThrow({
          branchId: row.branchId,
          parentId: nextParentId,
        });

        // Validar que no cree ciclos
        await this.validateNoCircularReference(
          row.branchId,
          row._id,
          nextParentId
        );
      }

      row.parentId = nextParentId ?? null;
    }

    if (dto.order !== undefined) {
      row.order = dto.order;
    }

    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    if (dto.affectsProfit !== undefined) {
      row.affectsProfit = dto.affectsProfit;
    }

    if (dto.includeInStats !== undefined) {
      row.includeInStats = dto.includeInStats;
    }

    try {
      await row.save();
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        throw new BadRequestException(
          "Ya existe una categoría con ese código o nombre en ese nivel"
        );
      }
      throw e;
    }

    return this.toDTO(row.toObject());
  }

  async archive(params: { branchId: string; id: string }): Promise<{ ok: boolean }> {
    const { branchId, id } = params;
    const row = await this.findCategoryOrThrow(branchId, id);

    row.isActive = false;
    await row.save();

    return { ok: true };
  }

  async restore(params: { branchId: string; id: string }): Promise<{ ok: boolean }> {
    const { branchId, id } = params;
    const row = await this.findCategoryOrThrow(branchId, id);

    row.isActive = true;
    await row.save();

    return { ok: true };
  }

  async softDelete(params: { branchId: string; id: string }): Promise<{ ok: boolean }> {
    const { branchId, id } = params;
    const row = await this.findCategoryOrThrow(branchId, id);

    // Validar que no tenga hijos
    const children = await this.categoryModel.countDocuments({
      branchId: row.branchId,
      parentId: row._id,
      deletedAt: null,
    });

    if (children > 0) {
      throw new BadRequestException(
        `No se puede eliminar la categoría porque tiene ${children} subcategoría(s)`
      );
    }

    row.isActive = false;
    row.deletedAt = new Date();
    await row.save();

    return { ok: true };
  }

  /**
   * Obtiene el árbol jerárquico de categorías
   */
  async getTree(params: {
    branchId: string;
    direction?: FinanceCategoryDirection;
    type?: FinanceCategoryType;
    activeOnly?: boolean;
  }): Promise<FinanceCategoryTreeResponseDto[]> {
    const filter: any = {
      branchId: ensureBranchObjectId(params.branchId),
      deletedAt: null,
    };

    if (params.direction) {
      filter.direction = params.direction;
    }

    if (params.type) {
      filter.type = params.type;
    }

    if (params.activeOnly) {
      filter.isActive = true;
    }

    const categories = await this.categoryModel
      .find(filter)
      .sort({ order: 1, name: 1 })
      .lean();

    return this.buildTree(categories);
  }

  // =====================
  // MÉTODOS PRIVADOS
  // =====================

  private async findCategoryOrThrow(
    branchId: string,
    id: string
  ): Promise<FinanceCategoryDocument> {
    ensureValidObjectId(id, "ID de categoría");

    const row = await this.categoryModel.findOne({
      _id: id,
      branchId: ensureBranchObjectId(branchId),
      deletedAt: null,
    });

    if (!row) {
      throw new NotFoundException("Categoría no encontrada");
    }

    return row;
  }

  private async assertParentInSameBranchOrThrow(params: {
    branchId: Types.ObjectId;
    parentId: Types.ObjectId;
  }): Promise<void> {
    const parent = await this.categoryModel
      .findOne({
        _id: params.parentId,
        branchId: params.branchId,
        deletedAt: null,
      })
      .select({ _id: 1 })
      .lean();

    if (!parent) {
      throw new BadRequestException(
        "La categoría padre no existe en esta sucursal (o está eliminada)"
      );
    }
  }

  private async validateNoCircularReference(
    branchId: Types.ObjectId,
    categoryId: Types.ObjectId,
    newParentId: Types.ObjectId
  ): Promise<void> {
    // Verificar que el nuevo padre no sea descendiente de la categoría actual
    let currentParentId: Types.ObjectId | null = newParentId;
    const visited = new Set<string>();

    while (currentParentId) {
      const currentParentIdStr = String(currentParentId);

      // Detectar ciclo
      if (currentParentIdStr === String(categoryId)) {
        throw new BadRequestException(
          "No se puede crear una referencia circular en la jerarquía"
        );
      }

      // Evitar loops infinitos
      if (visited.has(currentParentIdStr)) {
        break;
      }
      visited.add(currentParentIdStr);

      // Buscar el siguiente padre
      const parent = await this.categoryModel.findOne({
        _id: currentParentId,
        branchId,
        deletedAt: null,
      });

      if (!parent || !parent.parentId) {
        break;
      }

      currentParentId = parent.parentId;
    }
  }

  private buildTree(categories: any[]): FinanceCategoryTreeResponseDto[] {
    const map = new Map<string, FinanceCategoryTreeResponseDto>();
    const roots: FinanceCategoryTreeResponseDto[] = [];

    // Crear nodos
    categories.forEach((cat) => {
      map.set(String(cat._id), { 
        ...this.toDTO(cat), 
        children: [] 
      });
    });

    // Construir árbol
    categories.forEach((cat) => {
      const node = map.get(String(cat._id));
      if (!cat.parentId) {
        roots.push(node!);
      } else {
        const parent = map.get(String(cat.parentId));
        if (parent) {
          parent.children.push(node!);
        } else {
          // Padre no encontrado o eliminado, agregar como raíz
          roots.push(node!);
        }
      }
    });

    return roots;
  }

  private toDTO(row: any): FinanceCategoryResponseDto {
    return {
      id: String(row._id),
      branchId: row.branchId ? String(row.branchId) : null,
      code: row.code,
      name: row.name,
      type: row.type,
      direction: row.direction,
      parentId: row.parentId ? String(row.parentId) : null,
      order: Number(row.order ?? 0),
      isActive: !!row.isActive,
      affectsProfit: row.affectsProfit ?? true,
      includeInStats: row.includeInStats ?? true,
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}