import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ProductionEntry,
  ProductionDocument,
} from './schemas/production.schema';
import { CreateProductionDto } from './dto/create-production.dto';

function toDateKey(d: Date) {
  // YYYY-MM-DD en UTC (simple). Si querés Argentina (America/Argentina/Cordoba), lo ajustamos luego.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function validateDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
  }
  return dateKey;
}

@Injectable()
export class ProductionService {
  constructor(
    @InjectModel(ProductionEntry.name)
    private readonly productionModel: Model<ProductionDocument>,
  ) {}

  private oid(v: any): string | null {
    if (!v) return null;
    if (typeof v === 'object' && v._id) return String(v._id);
    return String(v);
  }
  private nameFromPopulated(v: any): string | null {
    if (!v || typeof v !== 'object') return null;

    // Employee
    if ('fullName' in v) return v.fullName ?? null;

    // Task
    if ('name' in v) return v.name ?? null;

    return null;
  }

  private toDTO(d: any) {
    return {
      id: String(d._id),
      dateKey: d.dateKey,

      // si tu frontend usa "at"
      at: d.performedAt?.toISOString?.() ?? String(d.performedAt),

      performedAt: d.performedAt?.toISOString?.() ?? String(d.performedAt),

      employeeId: this.oid(d.employeeId),
      employeeName: this.nameFromPopulated(d.employeeId),

      taskId: this.oid(d.taskId),
      taskName: this.nameFromPopulated(d.taskId),

      qty: d.qty ?? null,
      notes: d.notes ?? null,

      createdBy: this.oid(d.createdBy),
    };
  }
  async create(dto: CreateProductionDto, createdByUserId: string) {
    const performedAt = new Date(); // ✅ hora real del server al cargar
    const dateKey = toDateKey(performedAt);

    const doc = await this.productionModel.create({
      dateKey,
      performedAt,
      employeeId: new Types.ObjectId(dto.employeeId),
      taskId: new Types.ObjectId(dto.taskId),
      qty: dto.qty ?? null,
      notes: dto.notes ?? null,
      createdBy: new Types.ObjectId(createdByUserId),
    });

    return this.toDTO(doc);
  }
  async list(params: {
    dateKey?: string;
    employeeId?: string;
    taskId?: string;
    limit?: number;
  }) {
    const filter: any = {};

    if (params.dateKey) filter.dateKey = validateDateKey(params.dateKey);

    if (params.employeeId) {
      if (!Types.ObjectId.isValid(params.employeeId))
        throw new BadRequestException('employeeId inválido');
      filter.employeeId = new Types.ObjectId(params.employeeId);
    }

    if (params.taskId) {
      if (!Types.ObjectId.isValid(params.taskId))
        throw new BadRequestException('taskId inválido');
      filter.taskId = new Types.ObjectId(params.taskId);
    }

    const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);

    const docs = await this.productionModel
      .find(filter)
      .sort({ performedAt: -1, createdAt: -1 })
      .limit(limit)
      .populate({ path: 'employeeId', select: 'fullName' })
      .populate({ path: 'taskId', select: 'name' })
      .lean();

    return docs.map((d) => this.toDTO(d));
  }

  async remove(id: string) {
    const doc = await this.productionModel.findByIdAndDelete(id).lean();
    if (!doc) throw new BadRequestException('Registro no encontrado');
    return { ok: true };
  }
}
