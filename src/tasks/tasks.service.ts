import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Task, TaskDocument } from "./schemas/task.schema";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>
  ) {}

  private toDTO(doc: any) {
    return {
      id: String(doc._id),
      name: doc.name,
      area: doc.area ?? null,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(dto: CreateTaskDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("name requerido");

    const area =
      dto.area === undefined || dto.area === null
        ? null
        : dto.area.trim() || null;

    try {
      const doc = await this.taskModel.create({
        name,
        area,
        isActive: true,
      });
      return this.toDTO(doc);
    } catch (e: any) {
      // duplicado por unique index
      if (e?.code === 11000) {
        throw new BadRequestException("Ya existe una tarea con ese nombre");
      }
      throw e;
    }
  }

  async findAll(params?: { activeOnly?: boolean; area?: string }) {
    const filter: any = {};
    if (params?.activeOnly) filter.isActive = true;
    if (params?.area) filter.area = params.area;

    const docs = await this.taskModel.find(filter).sort({ name: 1 }).lean();
    return docs.map((d) => this.toDTO(d));
  }

  async findOne(id: string) {
    const doc = await this.taskModel.findById(id).lean();
    if (!doc) throw new NotFoundException("Tarea no encontrada");
    return this.toDTO(doc);
  }

  async update(id: string, dto: UpdateTaskDto) {
    const patch: any = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException("name inválido");
      patch.name = name;
    }

    if (dto.area !== undefined) {
      patch.area = dto.area === null ? null : dto.area.trim() || null;
    }

    try {
      const doc = await this.taskModel
        .findByIdAndUpdate(id, patch, { new: true })
        .lean();

      if (!doc) throw new NotFoundException("Tarea no encontrada");
      return this.toDTO(doc);
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new BadRequestException("Ya existe una tarea con ese nombre");
      }
      throw e;
    }
  }

  async setActive(id: string, isActive: boolean) {
    const doc = await this.taskModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .lean();

    if (!doc) throw new NotFoundException("Tarea no encontrada");
    return this.toDTO(doc);
  }
}
