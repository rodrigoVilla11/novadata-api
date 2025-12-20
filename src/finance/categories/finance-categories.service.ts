import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  FinanceCategory,
  FinanceCategoryDocument,
  FinanceCategoryType,
} from './schemas/finance-category.schema';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';

@Injectable()
export class FinanceCategoriesService {
  constructor(
    @InjectModel(FinanceCategory.name)
    private readonly categoryModel: Model<FinanceCategoryDocument>,
  ) {}

  async create(userId: string, dto: CreateFinanceCategoryDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('name is required');

    // Regla simple anti-duplicados por parent + type + name (ignora soft deleted)
    const exists = await this.categoryModel.exists({
      name: name,
      parentId: dto.parentId ?? null,
      type: dto.type,
      deletedAt: null,
    });
    if (exists)
      throw new BadRequestException('Ya existe una categoría con ese nombre');

    const created = await this.categoryModel.create({
      name,
      type: dto.type,
      parentId: dto.parentId ?? null,
      order: dto.order ?? 0,
      isActive: true,
      createdByUserId: userId || null,
      deletedAt: null,
    });

    return this.toDTO(created);
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

    if (typeof params.active === 'boolean') filter.isActive = params.active;

    // parentId:
    // - si viene "null" (string) => padres
    // - si viene un id => hijos
    // - si no viene => todos
    if (params.parentId !== undefined) {
      filter.parentId = params.parentId;
    }

    if (params.q?.trim()) {
      const qq = params.q.trim();
      filter.name = {
        $regex: qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      };
    }

    const rows = await this.categoryModel
      .find(filter)
      .sort({ order: 1, name: 1 })
      .lean();

    return rows.map((r) => this.toDTO(r));
  }

  async findOne(id: string) {
    const row = await this.categoryModel.findById(id).lean();
    if (!row || row.deletedAt)
      throw new NotFoundException('Categoría no encontrada');
    return this.toDTO(row);
  }

  async update(id: string, dto: UpdateFinanceCategoryDto) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt)
      throw new NotFoundException('Categoría no encontrada');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('name vacío');
      row.name = name;
    }

    if (dto.type !== undefined) row.type = dto.type;
    if (dto.parentId !== undefined) {
      row.parentId = dto.parentId ? new Types.ObjectId(dto.parentId) : null;
    }

    if (dto.order !== undefined) row.order = dto.order;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;

    await row.save();
    return this.toDTO(row.toObject());
  }

  async archive(id: string) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt)
      throw new NotFoundException('Categoría no encontrada');

    row.isActive = false;
    await row.save();
    return { ok: true };
  }

  async restore(id: string) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt)
      throw new NotFoundException('Categoría no encontrada');

    row.isActive = true;
    await row.save();
    return { ok: true };
  }

  async softDelete(id: string) {
    const row = await this.categoryModel.findById(id);
    if (!row || row.deletedAt)
      throw new NotFoundException('Categoría no encontrada');

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
      parentId: row.parentId ?? null,
      order: row.order ?? 0,
      isActive: !!row.isActive,
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt
        ? new Date(row.createdAt).toISOString()
        : undefined,
      updatedAt: row.updatedAt
        ? new Date(row.updatedAt).toISOString()
        : undefined,
    };
  }
}
