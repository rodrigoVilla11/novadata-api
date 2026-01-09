import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

function toObjectId(id: string, field = 'id') {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`${field} inválido`);
  }
  return new Types.ObjectId(id);
}

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  private toDTO(doc: any) {
    return {
      id: String(doc._id),
      branchId: doc.branchId ? String(doc.branchId) : null,
      name: doc.name,
      area: doc.area ?? null,
      isActive: !!doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(branchId: string, dto: CreateTaskDto) {
    const bId = toObjectId(branchId, 'branchId');

    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('name requerido');

    const area =
      dto.area === undefined || dto.area === null
        ? null
        : dto.area.trim() || null;

    try {
      const doc = await this.taskModel.create({
        branchId: bId,
        name,
        area,
        isActive: true,
        // nameLower/areaLower se setean en el pre-hook del schema
      });
      return this.toDTO(doc);
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new BadRequestException(
          'Ya existe una tarea con ese nombre en esta sucursal',
        );
      }
      throw e;
    }
  }

  async findAll(
    branchId: string,
    params?: { activeOnly?: boolean; area?: string },
  ) {
    const bId = toObjectId(branchId, 'branchId');

    const filter: any = { branchId: bId, deletedAt: null };

    if (params?.activeOnly) filter.isActive = true;

    if (params?.area?.trim()) {
      // si tenés areaLower en el schema, esto te hace case-insensitive y index-friendly
      filter.areaLower = params.area.trim().toLowerCase();
      // si NO usás areaLower, reemplazá por: filter.area = params.area.trim();
    }

    const docs = await this.taskModel
      .find(filter)
      .sort({ nameLower: 1 })
      .lean();
    return docs.map((d) => this.toDTO(d));
  }

  async findOne(branchId: string, id: string) {
    const bId = toObjectId(branchId, 'branchId');
    const _id = toObjectId(id, 'id');

    const doc = await this.taskModel
      .findOne({ _id, branchId: bId, deletedAt: null })
      .lean();

    if (!doc) throw new NotFoundException('Tarea no encontrada');
    return this.toDTO(doc);
  }

  async update(branchId: string, id: string, dto: UpdateTaskDto) {
    const bId = toObjectId(branchId, 'branchId');
    const _id = toObjectId(id, 'id');

    const patch: any = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('name inválido');
      patch.name = name;
      // nameLower se recalcula por el pre-hook validate/save.
      // OJO: findOneAndUpdate no dispara validate/save hooks.
      // Por eso, si dependés de nameLower, conviene setearlo acá también:
      patch.nameLower = name.toLowerCase();
    }

    if (dto.area !== undefined) {
      const area = dto.area === null ? null : dto.area.trim() || null;
      patch.area = area;
      patch.areaLower = area ? area.toLowerCase() : null;
    }

    try {
      const doc = await this.taskModel
        .findOneAndUpdate(
          { _id, branchId: bId, deletedAt: null },
          { $set: patch },
          { new: true },
        )
        .lean();

      if (!doc) throw new NotFoundException('Tarea no encontrada');
      return this.toDTO(doc);
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new BadRequestException(
          'Ya existe una tarea con ese nombre en esta sucursal',
        );
      }
      throw e;
    }
  }

  async setActive(branchId: string, id: string, isActive: boolean) {
    const bId = toObjectId(branchId, 'branchId');
    const _id = toObjectId(id, 'id');

    const doc = await this.taskModel
      .findOneAndUpdate(
        { _id, branchId: bId, deletedAt: null },
        { $set: { isActive: !!isActive } },
        { new: true },
      )
      .lean();

    if (!doc) throw new NotFoundException('Tarea no encontrada');
    return this.toDTO(doc);
  }
}
