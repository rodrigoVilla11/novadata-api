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
  branchId?: string | null;
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
  constructor(@InjectModel(Category.name) private readonly model: Model<Category>) {}

  async create(input: CreateCategoryInput) {
    const payload = this.normalizeCreate(input);

    try {
      const doc = await this.model.create(payload);
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Category already exists');
      throw e;
    }
  }

  async update(id: string, input: UpdateCategoryInput) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Category not found');

    const merged = {
      name: existing.name,
      branchId: existing.branchId ? String(existing.branchId) : null,
      description: existing.description ?? null,
      imageUrl: existing.imageUrl ?? null,
      tags: (existing.tags ?? []) as string[],
      sortOrder: Number(existing.sortOrder ?? 0),
      ...input,
    };

    const payload = this.normalizeUpdate(merged);

    try {
      const doc = await this.model.findByIdAndUpdate(id, payload, { new: true });
      if (!doc) throw new NotFoundException('Category not found');
      return this.toDto(doc);
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Category already exists');
      throw e;
    }
  }

  async findAll(params?: {
    onlyActive?: boolean;
    branchId?: string;
    q?: string;
    tag?: string;
  }) {
    const filter: any = {};

    if (params?.onlyActive) filter.isActive = true;
    if (params?.branchId) filter.branchId = new Types.ObjectId(params.branchId);
    if (params?.tag?.trim()) filter.tags = params.tag.trim().toLowerCase();

    if (params?.q?.trim()) {
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

  async findOne(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new NotFoundException('Category not found');
    return this.toDto(doc);
  }

  async setActive(id: string, isActive: boolean) {
    const doc = await this.model.findByIdAndUpdate(
      id,
      { isActive: !!isActive },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Category not found');
    return this.toDto(doc);
  }

  // ----------------
  // Helpers
  // ----------------

  private normalizeCreate(input: CreateCategoryInput) {
    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    const branchId = input.branchId ? new Types.ObjectId(input.branchId) : null;

    const tags = (input.tags ?? [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase());

    const sortOrder = this.num(input.sortOrder ?? 0);

    return {
      name,
      branchId,
      description: input.description ? String(input.description).trim() : null,
      imageUrl: input.imageUrl ? String(input.imageUrl).trim() : null,
      tags,
      sortOrder,
      isActive: true,
    };
  }

  private normalizeUpdate(input: any) {
    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    const branchId = input.branchId ? new Types.ObjectId(input.branchId) : null;

    const tags = (input.tags ?? [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase());

    const sortOrder = this.num(input.sortOrder ?? 0);

    return {
      name,
      branchId,
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
      branchId: doc.branchId ? String(doc.branchId) : null,
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
}
