import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category } from './schemas/category.schema';

type CreateCategoryInput = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  tags?: string[];
  sortOrder?: number;
};

type UpdateCategoryInput = Partial<CreateCategoryInput> & {
  isActive?: boolean;
};

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly model: Model<Category>,
  ) {}

  /**
   * Crea categoría SIEMPRE dentro del branch del usuario (multi-tenant).
   * branchId es obligatorio y viene del JWT (req.user.branchId).
   */
  async create(input: CreateCategoryInput, branchId: string) {
    const payload = this.normalizeCreate(input, branchId);

    try {
      const doc = await this.model.create(payload);
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Category already exists');
      throw e;
    }
  }

  /**
   * Update solo dentro del mismo branch del usuario.
   * No se permite mover categorías entre branches.
   */
  async update(id: string, input: UpdateCategoryInput, branchId: string) {
    const _id = this.asObjectId(id);
    const bId = this.asObjectId(branchId);

    const existing = await this.model.findOne({ _id, branchId: bId }).lean();
    if (!existing) throw new NotFoundException('Category not found');

    const merged = {
      name: existing.name,
      description: existing.description ?? null,
      imageUrl: existing.imageUrl ?? null,
      tags: (existing.tags ?? []) as string[],
      sortOrder: Number(existing.sortOrder ?? 0),
      isActive: existing.isActive ?? true,
      ...input,
    };

    const payload = this.normalizeUpdate(merged, branchId);

    try {
      const doc = await this.model.findOneAndUpdate(
        { _id, branchId: bId },
        payload,
        { new: true },
      );
      if (!doc) throw new NotFoundException('Category not found');
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Category already exists');
      throw e;
    }
  }

  /**
   * Lista categorías del branch del usuario.
   */
  async findAll(params: {
    branchId: string;
    onlyActive?: boolean;
    q?: string;
    tag?: string;
  }) {
    const bId = this.asObjectId(params.branchId);
    const filter: any = { branchId: bId };

    if (params.onlyActive) filter.isActive = true;

    if (params.tag?.trim()) filter.tags = params.tag.trim().toLowerCase();

    if (params.q?.trim()) {
      const q = params.q.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
      ];
    }

    const items = await this.model
      .find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return items.map((x: any) => this.toDto(x));
  }

  /**
   * Obtiene 1 categoría, solo si pertenece al branch del usuario.
   */
  async findOne(id: string, branchId: string) {
    const _id = this.asObjectId(id);
    const bId = this.asObjectId(branchId);

    const doc = await this.model.findOne({ _id, branchId: bId }).lean();
    if (!doc) throw new NotFoundException('Category not found');
    return this.toDto(doc);
  }

  /**
   * Activa/desactiva categoría, solo dentro del branch del usuario.
   */
  async setActive(id: string, isActive: boolean, branchId: string) {
    const _id = this.asObjectId(id);
    const bId = this.asObjectId(branchId);

    const doc = await this.model.findOneAndUpdate(
      { _id, branchId: bId },
      { isActive: !!isActive },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Category not found');
    return this.toDto(doc);
  }

  // ----------------
  // Helpers
  // ----------------

  private normalizeCreate(input: CreateCategoryInput, branchId: string) {
    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    const tags = (input.tags ?? [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase());

    const sortOrder = this.num(input.sortOrder ?? 0);

    return {
      name,
      branchId: this.asObjectId(branchId),
      description: input.description ? String(input.description).trim() : null,
      imageUrl: input.imageUrl ? String(input.imageUrl).trim() : null,
      tags,
      sortOrder,
      isActive: true,
    };
  }

  private normalizeUpdate(input: any, branchId: string) {
    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    const tags = (input.tags ?? [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase());

    const sortOrder = this.num(input.sortOrder ?? 0);

    return {
      name,
      // 👇 se fuerza el branchId del usuario, no del body
      branchId: this.asObjectId(branchId),
      description: input.description ? String(input.description).trim() : null,
      imageUrl: input.imageUrl ? String(input.imageUrl).trim() : null,
      tags,
      sortOrder,
      isActive: input.isActive ?? true,
    };
  }

  private toDto(doc: any) {
    return {
      id: String(doc._id ?? doc.id),
      name: doc.name,
      branchId: String(doc.branchId),
      description: doc.description ?? null,
      imageUrl: doc.imageUrl ?? null,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      sortOrder: this.num(doc.sortOrder ?? 0),
      isActive: doc.isActive ?? true,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private num(v: any) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private asObjectId(id: string) {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    return new Types.ObjectId(id);
  }
}
