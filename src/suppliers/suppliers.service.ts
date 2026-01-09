import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Supplier,
  SupplierWorkMode,
  Weekday,
} from './schemas/supplier.schema';

function toObjectId(id: string, field = 'id') {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return new Types.ObjectId(id);
}

function normalizeName(name: string) {
  const clean = (name ?? '').trim();
  if (!clean) throw new BadRequestException('Name is required');
  return clean;
}

function assertBranchId(branchId: string | null | undefined) {
  const b = (branchId ?? '').trim();
  if (!b) throw new BadRequestException('branchId is required');
  if (!Types.ObjectId.isValid(b)) throw new BadRequestException('Invalid branchId');
  return b;
}

function validateWorkMode(data: {
  workMode?: SupplierWorkMode | null;
  paymentDays?: number | null;
}) {
  const workMode = data.workMode ?? SupplierWorkMode.IMMEDIATE;
  const paymentDays = data.paymentDays ?? null;

  if (workMode === SupplierWorkMode.ACCOUNT) {
    if (paymentDays == null || Number(paymentDays) <= 0) {
      throw new BadRequestException(
        'paymentDays is required when workMode is ACCOUNT',
      );
    }
  }
  if (workMode === SupplierWorkMode.IMMEDIATE) {
    // opcional: forzar null para evitar datos inconsistentes
    // si preferís permitirlo, borrá esto
    if (paymentDays != null && Number(paymentDays) > 0) {
      throw new BadRequestException(
        'paymentDays must be null when workMode is IMMEDIATE',
      );
    }
  }
}

type CreateSupplierInput = {
  name: string;

  contactName?: string | null;
  phone?: string | null;
  email?: string | null;

  taxId?: string | null;
  address?: string | null;

  workMode?: SupplierWorkMode;
  paymentDays?: number | null;

  orderDays?: Weekday[];
  leadTimeDays?: number | null;
  cutoffTime?: string | null;

  notes?: string | null;
};

type UpdateSupplierInput = Partial<CreateSupplierInput> & {
  isActive?: boolean;
};

function mapSupplier(s: any) {
  return {
    id: String(s._id),
    branchId: s.branchId ? String(s.branchId) : null,

    name: s.name,
    isActive: s.isActive ?? true,

    contactName: s.contactName ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,

    taxId: s.taxId ?? null,
    address: s.address ?? null,

    workMode: s.workMode ?? SupplierWorkMode.IMMEDIATE,
    paymentDays: s.paymentDays ?? null,

    orderDays: Array.isArray(s.orderDays) ? s.orderDays : [],
    leadTimeDays: s.leadTimeDays ?? null,
    cutoffTime: s.cutoffTime ?? null,

    notes: s.notes ?? null,

    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<Supplier>,
  ) {}

  /**
   * Create supplier in a specific branch
   */
  async create(branchId: string, input: CreateSupplierInput) {
    const bId = assertBranchId(branchId);
    const cleanName = normalizeName(input.name);

    validateWorkMode({
      workMode: input.workMode ?? SupplierWorkMode.IMMEDIATE,
      paymentDays: input.paymentDays ?? null,
    });

    const payload: any = {
      branchId: toObjectId(bId, 'branchId'),
      name: cleanName,

      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,

      taxId: input.taxId ?? null,
      address: input.address ?? null,

      workMode: input.workMode ?? SupplierWorkMode.IMMEDIATE,
      paymentDays: input.paymentDays ?? null,

      orderDays: input.orderDays ?? [],
      leadTimeDays: input.leadTimeDays ?? null,
      cutoffTime: input.cutoffTime ?? null,

      notes: input.notes ?? null,
    };

    try {
      const doc = await this.supplierModel.create(payload);
      return mapSupplier(doc);
    } catch (e: any) {
      // unique index {branchId, name}
      if (e?.code === 11000) {
        throw new ConflictException('Supplier already exists in this branch');
      }
      throw e;
    }
  }

  /**
   * List suppliers for a branch
   */
  async findAll(branchId: string, q?: { activeOnly?: boolean }) {
    const bId = assertBranchId(branchId);

    const filter: any = { branchId: toObjectId(bId, 'branchId') };
    if (q?.activeOnly) filter.isActive = true;

    const items = await this.supplierModel
      .find(filter)
      .sort({ name: 1 })
      .lean();

    return items.map(mapSupplier);
  }

  /**
   * Get one supplier by id within a branch (important for isolation)
   */
  async findOne(branchId: string, id: string) {
    const bId = assertBranchId(branchId);
    const _id = toObjectId(id, 'id');

    const doc = await this.supplierModel
      .findOne({ _id, branchId: toObjectId(bId, 'branchId') })
      .lean();

    if (!doc) throw new NotFoundException('Supplier not found');
    return mapSupplier(doc);
  }

  /**
   * Update supplier fields (within branch)
   */
  async update(branchId: string, id: string, input: UpdateSupplierInput) {
    const bId = assertBranchId(branchId);
    const _id = toObjectId(id, 'id');

    // Si actualiza workMode/paymentDays validamos coherencia final
    const current = await this.supplierModel
      .findOne({ _id, branchId: toObjectId(bId, 'branchId') })
      .lean();

    if (!current) throw new NotFoundException('Supplier not found');

    const nextWorkMode = (input.workMode ?? (current as any).workMode ?? SupplierWorkMode.IMMEDIATE) as SupplierWorkMode;
    const nextPaymentDays =
      input.paymentDays !== undefined ? input.paymentDays : ((current as any).paymentDays ?? null);

    validateWorkMode({ workMode: nextWorkMode, paymentDays: nextPaymentDays });

    const updateDoc: any = {};

    if (input.name !== undefined) updateDoc.name = normalizeName(input.name);

    if (input.isActive !== undefined) updateDoc.isActive = !!input.isActive;

    if (input.contactName !== undefined) updateDoc.contactName = input.contactName ?? null;
    if (input.phone !== undefined) updateDoc.phone = input.phone ?? null;
    if (input.email !== undefined) updateDoc.email = input.email ?? null;

    if (input.taxId !== undefined) updateDoc.taxId = input.taxId ?? null;
    if (input.address !== undefined) updateDoc.address = input.address ?? null;

    if (input.workMode !== undefined) updateDoc.workMode = input.workMode;
    if (input.paymentDays !== undefined) updateDoc.paymentDays = input.paymentDays ?? null;

    if (input.orderDays !== undefined) updateDoc.orderDays = input.orderDays ?? [];
    if (input.leadTimeDays !== undefined) updateDoc.leadTimeDays = input.leadTimeDays ?? null;
    if (input.cutoffTime !== undefined) updateDoc.cutoffTime = input.cutoffTime ?? null;

    if (input.notes !== undefined) updateDoc.notes = input.notes ?? null;

    try {
      const doc = await this.supplierModel.findOneAndUpdate(
        { _id, branchId: toObjectId(bId, 'branchId') },
        { $set: updateDoc },
        { new: true },
      );
      if (!doc) throw new NotFoundException('Supplier not found');
      return mapSupplier(doc);
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new ConflictException('Supplier already exists in this branch');
      }
      throw e;
    }
  }

  /**
   * Convenience: activate/deactivate
   */
  async setActive(branchId: string, id: string, isActive: boolean) {
    return this.update(branchId, id, { isActive });
  }
}
