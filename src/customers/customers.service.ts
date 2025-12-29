import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Customer, CustomerDocument } from "./schemas/customer.schema";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

function normTags(tags?: string[]) {
  const arr = (tags ?? [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(arr));
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  private toPublic(c: any) {
    return {
      id: String(c._id),
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      document: c.document ?? null,
      taxId: c.taxId ?? null,
      taxCondition: c.taxCondition,
      addresses: c.addresses ?? [],
      notes: c.notes ?? "",
      tags: c.tags ?? [],
      isActive: c.isActive ?? true,
      balance: Number(c.balance ?? 0) || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  async create(userId: string | null, dto: CreateCustomerDto) {
    const doc = await this.customerModel.create({
      name: dto.name.trim(),
      email: dto.email ? dto.email.trim().toLowerCase() : null,
      phone: dto.phone ? dto.phone.trim() : null,
      document: dto.document ? dto.document.trim() : null,
      taxId: dto.taxId ? dto.taxId.trim() : null,
      taxCondition: dto.taxCondition,
      addresses: dto.addresses ?? [],
      notes: dto.notes?.trim() ?? "",
      tags: normTags(dto.tags),
      isActive: dto.isActive ?? true,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    return this.toPublic(doc);
  }

  async findOne(id: string) {
    const doc = await this.customerModel.findById(id).lean();
    if (!doc) throw new NotFoundException("Customer not found");
    return this.toPublic(doc);
  }

  async update(userId: string | null, id: string, dto: UpdateCustomerDto) {
    const patch: any = { updatedByUserId: userId };

    if (dto.name !== undefined) patch.name = dto.name?.trim();
    if (dto.email !== undefined)
      patch.email = dto.email == null || dto.email === "" ? null : dto.email.trim().toLowerCase();
    if (dto.phone !== undefined)
      patch.phone = dto.phone == null || dto.phone === "" ? null : dto.phone.trim();
    if (dto.document !== undefined)
      patch.document = dto.document == null || dto.document === "" ? null : dto.document.trim();
    if (dto.taxId !== undefined)
      patch.taxId = dto.taxId == null || dto.taxId === "" ? null : dto.taxId.trim();
    if (dto.taxCondition !== undefined) patch.taxCondition = dto.taxCondition;
    if (dto.addresses !== undefined) patch.addresses = dto.addresses ?? [];
    if (dto.notes !== undefined) patch.notes = dto.notes?.trim() ?? "";
    if (dto.tags !== undefined) patch.tags = normTags(dto.tags);
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    const doc = await this.customerModel.findByIdAndUpdate(id, patch, { new: true }).lean();
    if (!doc) throw new NotFoundException("Customer not found");

    return this.toPublic(doc);
  }

  async setActive(userId: string | null, id: string, isActive: boolean) {
    const doc = await this.customerModel
      .findByIdAndUpdate(
        id,
        { isActive: !!isActive, updatedByUserId: userId },
        { new: true },
      )
      .lean();

    if (!doc) throw new NotFoundException("Customer not found");
    return this.toPublic(doc);
  }

  async list(params?: {
    q?: string;
    onlyActive?: boolean;
    limit?: number;
    cursor?: string;
  }) {
    const limit = Math.max(1, Math.min(200, Number(params?.limit ?? 50) || 50));

    const filter: any = {};
    if (params?.onlyActive) filter.isActive = true;

    if (params?.q?.trim()) {
      // usamos text index si existe
      filter.$text = { $search: params.q.trim() };
    }

    if (params?.cursor) {
      filter._id = { $lt: new Types.ObjectId(params.cursor) };
    }

    const rows = await this.customerModel
      .find(filter)
      .sort(params?.q?.trim() ? { score: { $meta: "textScore" } as any, _id: -1 } : { _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((c) => this.toPublic(c));
    const nextCursor = hasMore ? String(rows[limit - 1]._id) : null;

    return { items, nextCursor };
  }
}
