import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from './schemas/employee.schema';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { User, UserDocument, Role } from '../users/schemas/user.schema';

type Actor = {
  id: string;
  roles: Role[];
  branchId: string | null;
};

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private isSuper(actor: Actor) {
    return (actor.roles ?? []).includes('SUPERADMIN');
  }

  private mustHaveBranch(actor: Actor) {
    if (this.isSuper(actor)) return;
    if (!actor.branchId) throw new ForbiddenException('Missing branchId in token');
  }

  private toDTO(doc: any) {
    return {
      id: String(doc._id),
      branchId: doc.branchId ? String(doc.branchId) : null,
      fullName: doc.fullName,
      hireDate: doc.hireDate,
      hourlyRate: doc.hourlyRate,
      userId: doc.userId ? String(doc.userId) : null,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private async assertUserSameBranchOrThrow(actor: Actor, userId: string) {
    if (!isValidObjectId(userId)) throw new BadRequestException('userId inválido');

    const user = await this.userModel
      .findById(userId)
      .select({ _id: 1, branchId: 1, roles: 1 })
      .lean();

    if (!user) throw new BadRequestException('User no encontrado');

    // SUPERADMIN puede linkear con cualquiera, pero OJO:
    // igual podrías exigir que el user tenga branchId.
    if (this.isSuper(actor)) return;

    const userBranch = user.branchId ? String(user.branchId) : null;
    if (!userBranch || userBranch !== actor.branchId) {
      throw new ForbiddenException('No podés vincular un user de otra sucursal');
    }
  }

  private async getEmployeeScopedOrThrow(actor: Actor, id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('id inválido');

    const doc = await this.employeeModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Empleado no encontrado');

    if (!this.isSuper(actor)) {
      this.mustHaveBranch(actor);
      if (String(doc.branchId) !== actor.branchId) {
        throw new NotFoundException('Empleado no encontrado'); // ocultar existencia
      }
    }

    return doc;
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------
  async create(actor: Actor, dto: CreateEmployeeDto) {
    // branch scoping
    if (!this.isSuper(actor)) this.mustHaveBranch(actor);

    const hireDate = new Date(dto.hireDate);
    if (Number.isNaN(hireDate.getTime()))
      throw new BadRequestException('hireDate inválida');

    // ✅ branchId: SUPERADMIN podría elegir (si dto trajera branchId),
    // pero como el DTO no lo trae, para SUPERADMIN exigimos pasar branchId por query en controller (ver abajo).
    const branchId = this.isSuper(actor)
      ? null
      : new Types.ObjectId(actor.branchId!);

    if (this.isSuper(actor)) {
      throw new BadRequestException(
        'SUPERADMIN must specify branchId to create employee',
      );
    }

    if (dto.userId) {
      await this.assertUserSameBranchOrThrow(actor, dto.userId);
    }

    const doc = await this.employeeModel.create({
      branchId: branchId!,
      fullName: dto.fullName.trim(),
      hireDate,
      hourlyRate: dto.hourlyRate,
      userId: dto.userId ? new Types.ObjectId(dto.userId) : null,
      isActive: true,
    });

    return this.toDTO(doc);
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------
  async findAll(
    actor: Actor,
    params?: { activeOnly?: boolean; branchId?: string | null },
  ) {
    const filter: any = {};
    if (params?.activeOnly) filter.isActive = true;

    if (this.isSuper(actor)) {
      // SUPERADMIN: opcional filtrar por branchId
      if (params?.branchId) {
        if (!isValidObjectId(params.branchId))
          throw new BadRequestException('branchId inválido');
        filter.branchId = new Types.ObjectId(params.branchId);
      }
    } else {
      this.mustHaveBranch(actor);
      filter.branchId = new Types.ObjectId(actor.branchId!);
    }

    const docs = await this.employeeModel
      .find(filter)
      .sort({ fullName: 1 })
      .lean();

    return docs.map((d) => this.toDTO(d));
  }

  // ---------------------------------------------------------------------------
  // Get one
  // ---------------------------------------------------------------------------
  async findOne(actor: Actor, id: string) {
    const doc = await this.getEmployeeScopedOrThrow(actor, id);
    return this.toDTO(doc);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  async update(actor: Actor, id: string, dto: UpdateEmployeeDto) {
    // primero validamos scope por id
    await this.getEmployeeScopedOrThrow(actor, id);

    const patch: any = {};

    if (dto.fullName !== undefined) patch.fullName = dto.fullName.trim();
    if (dto.hourlyRate !== undefined) patch.hourlyRate = dto.hourlyRate;

    if (dto.hireDate !== undefined) {
      const d = new Date(dto.hireDate);
      if (Number.isNaN(d.getTime()))
        throw new BadRequestException('hireDate inválida');
      patch.hireDate = d;
    }

    if (dto.userId !== undefined) {
      if (dto.userId) await this.assertUserSameBranchOrThrow(actor, dto.userId);
      patch.userId = dto.userId ? new Types.ObjectId(dto.userId) : null;
    }

    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    const doc = await this.employeeModel
      .findByIdAndUpdate(id, patch, { new: true })
      .lean();

    if (!doc) throw new NotFoundException('Empleado no encontrado');

    // scope check post-update (por las dudas)
    if (!this.isSuper(actor) && String(doc.branchId) !== actor.branchId) {
      throw new NotFoundException('Empleado no encontrado');
    }

    return this.toDTO(doc);
  }

  // ---------------------------------------------------------------------------
  // Active
  // ---------------------------------------------------------------------------
  async setActive(actor: Actor, id: string, isActive: boolean) {
    await this.getEmployeeScopedOrThrow(actor, id);

    const doc = await this.employeeModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .lean();

    if (!doc) throw new NotFoundException('Empleado no encontrado');

    if (!this.isSuper(actor) && String(doc.branchId) !== actor.branchId) {
      throw new NotFoundException('Empleado no encontrado');
    }

    return this.toDTO(doc);
  }

  // ---------------------------------------------------------------------------
  // Link user
  // ---------------------------------------------------------------------------
  async linkUser(actor: Actor, id: string, userId: string | null) {
    await this.getEmployeeScopedOrThrow(actor, id);

    if (userId) await this.assertUserSameBranchOrThrow(actor, userId);

    const patch = { userId: userId ? new Types.ObjectId(userId) : null };
    const doc = await this.employeeModel
      .findByIdAndUpdate(id, patch, { new: true })
      .lean();

    if (!doc) throw new NotFoundException('Empleado no encontrado');

    if (!this.isSuper(actor) && String(doc.branchId) !== actor.branchId) {
      throw new NotFoundException('Empleado no encontrado');
    }

    return this.toDTO(doc);
  }
}
