import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  FinanceMovement,
  FinanceMovementDocument,
  FinanceMovementType,
} from './schemas/finance-movement.schema';
import { CreateFinanceMovementDto } from './dto/create-finance-movement.dto';
import { UpdateFinanceMovementDto } from './dto/update-finance-movement.dto';
import { FinanceAccountsService } from '../accounts/finance-accounts.service';
import { FinanceCategoriesService } from '../categories/finance-categories.service';
import {
  FinanceDayClosing,
  FinanceDayClosingDocument,
} from '../closings/schemas/finance-day-closing.schema';

@Injectable()
export class FinanceMovementsService {
  constructor(
    @InjectModel(FinanceMovement.name)
    private readonly movementModel: Model<FinanceMovementDocument>,
    private readonly accountsService: FinanceAccountsService,
    private readonly categoriesService: FinanceCategoriesService,

    @InjectModel(FinanceDayClosing.name)
    private readonly closingModel: Model<FinanceDayClosingDocument>,
  ) {}

  private oid(id: string, field: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException(`${field} inválido`);
    return new Types.ObjectId(id);
  }

  private isAdmin(roles: string[] | undefined | null) {
    return Array.isArray(roles) && roles.includes('ADMIN');
  }

  private async assertDayNotLocked(dateKey: string, roles?: string[]) {
    const closing = await this.closingModel.findOne({ dateKey }).lean();
    if (!closing) return; // si no existe cierre, no bloquea

    if (closing.status === 'LOCKED' && !this.isAdmin(roles)) {
      throw new BadRequestException(
        `El día ${dateKey} está CERRADO (LOCKED). Solo ADMIN puede modificar movimientos.`,
      );
    }
  }

  private validateMovementInput(data: {
    type: FinanceMovementType;
    amount?: number;
    accountId?: string;
    toAccountId?: string | null;
  }) {
    if (data.amount !== undefined && !(Number(data.amount) >= 0)) {
      throw new BadRequestException('amount inválido');
    }

    if (!data.type) throw new BadRequestException('type requerido');

    if (data.type === FinanceMovementType.TRANSFER) {
      if (!data.toAccountId)
        throw new BadRequestException('toAccountId requerido para TRANSFER');
      if (
        data.accountId &&
        data.toAccountId &&
        data.accountId === data.toAccountId
      ) {
        throw new BadRequestException(
          'TRANSFER: cuenta origen y destino no pueden ser iguales',
        );
      }
    }
  }

  async create(userId: string, roles: string[], dto: CreateFinanceMovementDto) {
    await this.assertDayNotLocked(dto.dateKey, roles);
    this.validateMovementInput({
      type: dto.type,
      amount: dto.amount,
      accountId: dto.accountId,
      toAccountId: dto.toAccountId ?? null,
    });

    const accountId = this.oid(dto.accountId, 'accountId');
    const toAccountId =
      dto.type === FinanceMovementType.TRANSFER && dto.toAccountId
        ? this.oid(dto.toAccountId, 'toAccountId')
        : null;

    const categoryId = dto.categoryId
      ? this.oid(dto.categoryId, 'categoryId')
      : null;
    const providerId = dto.providerId
      ? this.oid(dto.providerId, 'providerId')
      : null;

    // Snapshots (no obligatorios)
    const account = await this.accountsService.findOne(String(accountId));
    const category = dto.categoryId
      ? await this.categoriesService.findOne(dto.categoryId)
      : null;

    const created = await this.movementModel.create({
      dateKey: dto.dateKey,
      type: dto.type,
      amount: dto.amount,
      accountId,
      toAccountId,
      categoryId,
      providerId,
      notes: dto.notes ?? null,
      createdByUserId: this.oid(userId, 'userId'),
      status: 'POSTED',
      accountNameSnapshot: account?.name ?? null,
      categoryNameSnapshot: category?.name ?? null,
    });

    return this.toDTO(created);
  }

  async findAll(params: {
    from?: string;
    to?: string;
    type?: FinanceMovementType;
    accountId?: string;
    categoryId?: string;
    q?: string;
    limit?: number;
    page?: number;
    includeVoids?: boolean;
    status?: 'ALL' | 'POSTED' | 'VOID';
  }) {
    const filter: any = { };

    if (params.status && params.status !== 'ALL') {
      filter.status = params.status;
    } else if (!params.includeVoids) {
      filter.status = { $ne: 'VOID' };
    }
    if (params.from || params.to) {
      filter.dateKey = {};
      if (params.from) filter.dateKey.$gte = params.from;
      if (params.to) filter.dateKey.$lte = params.to;
    }

    if (params.type) filter.type = params.type;

    if (params.accountId)
      filter.accountId = this.oid(params.accountId, 'accountId');
    if (params.categoryId)
      filter.categoryId = this.oid(params.categoryId, 'categoryId');

    if (params.q?.trim()) {
      const qq = params.q.trim();
      filter.$or = [
        {
          notes: {
            $regex: qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i',
          },
        },
        {
          accountNameSnapshot: {
            $regex: qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i',
          },
        },
        {
          categoryNameSnapshot: {
            $regex: qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i',
          },
        },
      ];
    }

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.movementModel
        .find(filter)
        .sort({ dateKey: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.movementModel.countDocuments(filter),
    ]);

    return {
      items: items.map((r) => this.toDTO(r)),
      page,
      limit,
      total,
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const row = await this.movementModel.findById(id).lean();
    if (!row) throw new NotFoundException('Movimiento no encontrado');
    return this.toDTO(row);
  }

  async update(id: string, roles: string[], dto: UpdateFinanceMovementDto) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const row = await this.movementModel.findById(id);
    if (!row) throw new NotFoundException('Movimiento no encontrado');
    const nextDateKey = dto.dateKey ?? row.dateKey;
    await this.assertDayNotLocked(row.dateKey, roles);
    await this.assertDayNotLocked(nextDateKey, roles);
    const nextType = dto.type ?? row.type;
    const nextAccountId = dto.accountId ?? String(row.accountId);
    const nextToAccountId =
      dto.toAccountId !== undefined
        ? dto.toAccountId
        : row.toAccountId
          ? String(row.toAccountId)
          : null;

    this.validateMovementInput({
      type: nextType,
      amount: dto.amount ?? row.amount,
      accountId: nextAccountId,
      toAccountId: nextToAccountId,
    });

    if (dto.dateKey !== undefined) row.dateKey = dto.dateKey;
    if (dto.type !== undefined) row.type = dto.type;
    if (dto.amount !== undefined) row.amount = dto.amount;

    if (dto.accountId !== undefined)
      row.accountId = this.oid(dto.accountId, 'accountId');

    if (dto.toAccountId !== undefined) {
      row.toAccountId =
        nextType === FinanceMovementType.TRANSFER && dto.toAccountId
          ? this.oid(dto.toAccountId, 'toAccountId')
          : null;
    }

    if (dto.categoryId !== undefined) {
      row.categoryId = dto.categoryId
        ? this.oid(dto.categoryId, 'categoryId')
        : null;
    }

    if (dto.providerId !== undefined) {
      row.providerId = dto.providerId
        ? this.oid(dto.providerId, 'providerId')
        : null;
    }

    if (dto.notes !== undefined) row.notes = dto.notes ?? null;

    if (dto.status !== undefined) row.status = dto.status;

    // refrescar snapshots si cambió account/category
    if (dto.accountId !== undefined) {
      const acc = await this.accountsService.findOne(dto.accountId);
      row.accountNameSnapshot = acc?.name ?? null;
    }
    if (dto.categoryId !== undefined) {
      const cat = dto.categoryId
        ? await this.categoriesService.findOne(dto.categoryId)
        : null;
      row.categoryNameSnapshot = cat?.name ?? null;
    }

    await row.save();
    return this.toDTO(row.toObject());
  }
  async void(id: string, roles: string[]) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const row = await this.movementModel.findById(id);
    if (!row) throw new NotFoundException('Movimiento no encontrado');
    await this.assertDayNotLocked(row.dateKey, roles);

    row.status = 'VOID';
    await row.save();
    return { ok: true };
  }

  private toDTO(row: any) {
    return {
      id: String(row._id),
      dateKey: row.dateKey,
      type: row.type,
      amount: Number(row.amount ?? 0),
      accountId: row.accountId ? String(row.accountId) : null,
      toAccountId: row.toAccountId ? String(row.toAccountId) : null,
      categoryId: row.categoryId ? String(row.categoryId) : null,
      providerId: row.providerId ? String(row.providerId) : null,
      notes: row.notes ?? null,
      status: row.status ?? 'POSTED',
      accountNameSnapshot: row.accountNameSnapshot ?? null,
      categoryNameSnapshot: row.categoryNameSnapshot ?? null,
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      createdAt: row.createdAt
        ? new Date(row.createdAt).toISOString()
        : undefined,
      updatedAt: row.updatedAt
        ? new Date(row.updatedAt).toISOString()
        : undefined,
    };
  }
}
