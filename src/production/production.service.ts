import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  ProductionEntry,
  ProductionDocument,
  ProductionStatus,
} from './schemas/production.schema';
import { CreateProductionDto } from './dto/create-production.dto';

import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';

const AR_TZ = 'America/Argentina/Cordoba';

function assertObjectId(id: string, label = 'id') {
  if (!Types.ObjectId.isValid(id))
    throw new BadRequestException(`${label} inválido`);
  return new Types.ObjectId(id);
}

function validateDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
  }
  return dateKey;
}

function toDateKeyAR(d: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function toTimeHHmmAR(d: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: AR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function clampLimit(n: any, def = 200) {
  const v = Number(n ?? def);
  const lim = Number.isFinite(v) ? v : def;
  return Math.min(Math.max(lim, 1), 500);
}

@Injectable()
export class ProductionService {
  constructor(
    @InjectModel(ProductionEntry.name)
    private readonly productionModel: Model<ProductionDocument>,

    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,

    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  private oid(v: any): string | null {
    if (!v) return null;
    if (typeof v === 'object' && v._id) return String(v._id);
    return String(v);
  }

  private nameFromPopulated(v: any): string | null {
    if (!v || typeof v !== 'object') return null;
    if ('fullName' in v) return (v as any).fullName ?? null; // Employee
    if ('name' in v) return (v as any).name ?? null; // Task
    if ('username' in v) return (v as any).username ?? null; // User
    return null;
  }

  private toDTO(d: any) {
    const notes = Array.isArray(d.notes)
      ? d.notes.map((n: any) => ({
          text: n?.text ?? '',
          createdAt: n?.createdAt ? new Date(n.createdAt).toISOString() : null,
          createdBy: this.oid(n?.createdBy),
          createdByName: this.nameFromPopulated(n?.createdBy),
        }))
      : [];

    return {
      id: String(d._id),
      branchId: this.oid(d.branchId),

      dateKey: d.dateKey,
      at: d.performedAt?.toISOString?.() ?? String(d.performedAt),
      performedAt: d.performedAt?.toISOString?.() ?? String(d.performedAt),
      time: d.time ?? null,

      status: (d.status as ProductionStatus) ?? 'PENDING',
      isDone: Boolean(d.isDone),

      doneAt: d.doneAt ? new Date(d.doneAt).toISOString() : null,
      doneBy: this.oid(d.doneBy),
      doneByName: this.nameFromPopulated(d.doneBy),

      employeeId: this.oid(d.employeeId),
      employeeName: this.nameFromPopulated(d.employeeId),

      taskId: this.oid(d.taskId),
      taskName: this.nameFromPopulated(d.taskId),

      qty: d.qty ?? null,

      notes,

      createdBy: this.oid(d.createdBy),
      createdByName: this.nameFromPopulated(d.createdBy),
    };
  }

  // ✅ valida que employeeId pertenezca a la branch
  private async assertEmployeeInBranch(employeeId: Types.ObjectId, branchId: Types.ObjectId) {
    const emp = await this.employeeModel
      .findOne({ _id: employeeId, branchId })
      .select({ _id: 1 })
      .lean();
    if (!emp) throw new BadRequestException('employeeId no pertenece a esta sucursal');
  }

  // ✅ valida que taskId pertenezca a la branch
  private async assertTaskInBranch(taskId: Types.ObjectId, branchId: Types.ObjectId) {
    const task = await this.taskModel
      .findOne({ _id: taskId, branchId })
      .select({ _id: 1 })
      .lean();
    if (!task) throw new BadRequestException('taskId no pertenece a esta sucursal');
  }

  async create(branchId: string, dto: CreateProductionDto, createdByUserId: string) {
    const bId = assertObjectId(branchId, 'branchId');
    const now = new Date();

    const performedAt = now;
    const dateKey = toDateKeyAR(now);
    const time = toTimeHHmmAR(now);

    const employeeId = assertObjectId(dto.employeeId, 'employeeId');
    const taskId = assertObjectId(dto.taskId, 'taskId');

    await this.assertEmployeeInBranch(employeeId, bId);
    await this.assertTaskInBranch(taskId, bId);

    const doc = await this.productionModel.create({
      branchId: bId,

      dateKey,
      performedAt,
      time,

      employeeId,
      taskId,

      qty: dto.qty ?? null,

      status: 'PENDING',
      isDone: false,
      doneAt: null,
      doneBy: null,

      notes: Array.isArray((dto as any).notes) ? (dto as any).notes : [],

      createdBy: assertObjectId(createdByUserId, 'createdBy'),
    });

    // populate para DTO lindo
    const populated = await this.productionModel
      .findById(doc._id)
      .populate({ path: 'employeeId', select: 'fullName' })
      .populate({ path: 'taskId', select: 'name' })
      .populate({ path: 'createdBy', select: 'username' })
      .populate({ path: 'doneBy', select: 'username' })
      .populate({ path: 'notes.createdBy', select: 'username' })
      .lean();

    return this.toDTO(populated ?? doc);
  }

  async list(
    branchId: string,
    params: {
      dateKey?: string;
      employeeId?: string;
      taskId?: string;
      status?: ProductionStatus;
      isDone?: boolean | string;
      limit?: number;
    },
  ) {
    const bId = assertObjectId(branchId, 'branchId');

    const filter: any = { branchId: bId };

    if (params.dateKey) filter.dateKey = validateDateKey(params.dateKey);

    if (params.employeeId)
      filter.employeeId = assertObjectId(params.employeeId, 'employeeId');
    if (params.taskId) filter.taskId = assertObjectId(params.taskId, 'taskId');

    if (params.status) filter.status = params.status;

    if (params.isDone !== undefined) {
      const v =
        typeof params.isDone === 'string'
          ? params.isDone === 'true'
          : Boolean(params.isDone);
      filter.isDone = v;
    }

    const limit = clampLimit(params.limit, 200);

    const docs = await this.productionModel
      .find(filter)
      .sort({ performedAt: -1, createdAt: -1 })
      .limit(limit)
      .populate({ path: 'employeeId', select: 'fullName' })
      .populate({ path: 'taskId', select: 'name' })
      .populate({ path: 'createdBy', select: 'username' })
      .populate({ path: 'doneBy', select: 'username' })
      .populate({ path: 'notes.createdBy', select: 'username' })
      .lean();

    return docs.map((d) => this.toDTO(d));
  }

  async markDone(branchId: string, id: string, userId: string, done: boolean) {
    const bId = assertObjectId(branchId, 'branchId');
    const _id = assertObjectId(id, 'id');
    const uid = assertObjectId(userId, 'userId');

    const now = new Date();

    const update: any = done
      ? {
          status: 'DONE',
          isDone: true,
          doneAt: now,
          doneBy: uid,
          performedAt: now,
          time: toTimeHHmmAR(now),
          dateKey: toDateKeyAR(now),
        }
      : {
          status: 'PENDING',
          isDone: false,
          doneAt: null,
          doneBy: null,
        };

    const doc = await this.productionModel
      .findOneAndUpdate({ _id, branchId: bId }, { $set: update }, { new: true })
      .populate({ path: 'employeeId', select: 'fullName' })
      .populate({ path: 'taskId', select: 'name' })
      .populate({ path: 'createdBy', select: 'username' })
      .populate({ path: 'doneBy', select: 'username' })
      .populate({ path: 'notes.createdBy', select: 'username' })
      .lean();

    if (!doc) throw new NotFoundException('Registro no encontrado');
    return this.toDTO(doc);
  }

  async addNote(branchId: string, id: string, userId: string, text: string) {
    const bId = assertObjectId(branchId, 'branchId');
    const _id = assertObjectId(id, 'id');
    const uid = assertObjectId(userId, 'userId');

    const clean = String(text ?? '').trim();
    if (!clean) throw new BadRequestException('La nota no puede estar vacía');

    const note = {
      text: clean,
      createdAt: new Date(),
      createdBy: uid,
    };

    const doc = await this.productionModel
      .findOneAndUpdate(
        { _id, branchId: bId },
        { $push: { notes: note } },
        { new: true },
      )
      .populate({ path: 'employeeId', select: 'fullName' })
      .populate({ path: 'taskId', select: 'name' })
      .populate({ path: 'createdBy', select: 'username' })
      .populate({ path: 'doneBy', select: 'username' })
      .populate({ path: 'notes.createdBy', select: 'username' })
      .lean();

    if (!doc) throw new NotFoundException('Registro no encontrado');
    return this.toDTO(doc);
  }

  async remove(branchId: string, id: string) {
    const bId = assertObjectId(branchId, 'branchId');
    const _id = assertObjectId(id, 'id');

    const doc = await this.productionModel
      .findOneAndDelete({ _id, branchId: bId })
      .lean();

    if (!doc) throw new NotFoundException('Registro no encontrado');
    return { ok: true };
  }

  async setCanceled(branchId: string, id: string, userId: string, canceled: boolean) {
    const bId = assertObjectId(branchId, 'branchId');
    const _id = assertObjectId(id, 'id');
    const uid = assertObjectId(userId, 'userId');

    const now = new Date();

    const update: any = canceled
      ? {
          status: 'CANCELED',
          canceledAt: now,
          canceledBy: uid,
          isDone: false,
          doneAt: null,
          doneBy: null,
        }
      : {
          status: 'PENDING',
          canceledAt: null,
          canceledBy: null,
        };

    const doc = await this.productionModel
      .findOneAndUpdate({ _id, branchId: bId }, { $set: update }, { new: true })
      .populate({ path: 'employeeId', select: 'fullName' })
      .populate({ path: 'taskId', select: 'name' })
      .populate({ path: 'createdBy', select: 'username' })
      .populate({ path: 'doneBy', select: 'username' })
      .populate({ path: 'canceledBy', select: 'username' })
      .populate({ path: 'notes.createdBy', select: 'username' })
      .lean();

    if (!doc) throw new NotFoundException('Registro no encontrado');
    return this.toDTO(doc);
  }
}
