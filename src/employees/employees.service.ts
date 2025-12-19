import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Employee, EmployeeDocument } from "./schemas/employee.schema";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>
  ) {}

  private toDTO(doc: any) {
    return {
      id: String(doc._id),
      fullName: doc.fullName,
      hireDate: doc.hireDate,
      hourlyRate: doc.hourlyRate,
      userId: doc.userId ? String(doc.userId) : null,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(dto: CreateEmployeeDto) {
    const hireDate = new Date(dto.hireDate);
    if (Number.isNaN(hireDate.getTime())) throw new BadRequestException("hireDate inválida");

    const doc = await this.employeeModel.create({
      fullName: dto.fullName.trim(),
      hireDate,
      hourlyRate: dto.hourlyRate,
      userId: dto.userId ? new Types.ObjectId(dto.userId) : null,
      isActive: true,
    });

    return this.toDTO(doc);
  }

  async findAll(params?: { activeOnly?: boolean }) {
    const filter: any = {};
    if (params?.activeOnly) filter.isActive = true;

    const docs = await this.employeeModel.find(filter).sort({ fullName: 1 }).lean();
    return docs.map((d) => this.toDTO(d));
  }

  async findOne(id: string) {
    const doc = await this.employeeModel.findById(id).lean();
    if (!doc) throw new NotFoundException("Empleado no encontrado");
    return this.toDTO(doc);
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const patch: any = {};

    if (dto.fullName !== undefined) patch.fullName = dto.fullName.trim();
    if (dto.hourlyRate !== undefined) patch.hourlyRate = dto.hourlyRate;

    if (dto.hireDate !== undefined) {
      const d = new Date(dto.hireDate);
      if (Number.isNaN(d.getTime())) throw new BadRequestException("hireDate inválida");
      patch.hireDate = d;
    }

    if (dto.userId !== undefined) {
      patch.userId = dto.userId ? new Types.ObjectId(dto.userId) : null;
    }

    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    const doc = await this.employeeModel.findByIdAndUpdate(id, patch, { new: true }).lean();
    if (!doc) throw new NotFoundException("Empleado no encontrado");
    return this.toDTO(doc);
  }

  async setActive(id: string, isActive: boolean) {
    const doc = await this.employeeModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException("Empleado no encontrado");
    return this.toDTO(doc);
  }

  async linkUser(id: string, userId: string | null) {
    const patch = { userId: userId ? new Types.ObjectId(userId) : null };
    const doc = await this.employeeModel.findByIdAndUpdate(id, patch, { new: true }).lean();
    if (!doc) throw new NotFoundException("Empleado no encontrado");
    return this.toDTO(doc);
  }
}
