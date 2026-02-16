import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { CreateFinanceAccountDto } from "./dto/create-finance-account.dto";
import { UpdateFinanceAccountDto } from "./dto/update-finance-account.dto";
import { FinanceAccount, FinanceAccountDocument } from "./schemas/finance-account.schema";

// =====================
// HELPERS
// =====================

function normCode(code: string): string {
  const c = (code || "").trim().toLowerCase();
  const safe = c.replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  
  if (!safe) {
    throw new BadRequestException("El código contiene solo caracteres inválidos");
  }
  
  return safe;
}

function normCurrency(cur?: string): string {
  const c = (cur || "ARS").trim().toUpperCase();
  return c || "ARS";
}

function ensureBranchObjectId(branchId: string): Types.ObjectId {
  if (!branchId || !Types.ObjectId.isValid(branchId)) {
    throw new BadRequestException("branchId inválido");
  }
  return new Types.ObjectId(branchId);
}

function ensureValidObjectId(id: string, fieldName: string = "ID"): void {
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`${fieldName} inválido`);
  }
}

// =====================
// TIPOS
// =====================

interface FinanceAccountDTO {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: number;
  requiresClosing: boolean;
  isActive: boolean;
  notes: string | null;
  createdByUserId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// =====================
// SERVICE
// =====================

@Injectable()
export class FinanceAccountsService {
  constructor(
    @InjectModel(FinanceAccount.name)
    private readonly accountModel: Model<FinanceAccountDocument>,
  ) {}

  async create(params: { 
    userId: string; 
    branchId: string; 
    dto: CreateFinanceAccountDto 
  }): Promise<FinanceAccountDTO> {
    const { userId, branchId, dto } = params;

    const branchObjectId = ensureBranchObjectId(branchId);

    // Validaciones adicionales
    const name = (dto.name || "").trim();
    if (!name) {
      throw new BadRequestException("El nombre es requerido");
    }

    const code = normCode(dto.code);
    if (!code) {
      throw new BadRequestException("El código es requerido");
    }

    const currency = normCurrency(dto.currency);

    const createdByUserId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : null;

    // Validar que el código no exista ya en esta sucursal
    const existingByCode = await this.accountModel.findOne({
      branchId: branchObjectId,
      code,
      deletedAt: null,
    });

    if (existingByCode) {
      throw new BadRequestException(`Ya existe una cuenta con el código "${code}" en esta sucursal`);
    }

    // Validar que el nombre no exista ya en esta sucursal
    const existingByName = await this.accountModel.findOne({
      branchId: branchObjectId,
      name,
      deletedAt: null,
    });

    if (existingByName) {
      throw new BadRequestException(`Ya existe una cuenta con el nombre "${name}" en esta sucursal`);
    }

    try {
      const created = await this.accountModel.create({
        branchId: branchObjectId,
        code,
        name,
        type: dto.type,
        currency,
        openingBalance: dto.openingBalance ?? 0,
        requiresClosing: dto.requiresClosing ?? true,
        notes: dto.notes ?? null,
        isActive: true,
        createdByUserId,
        deletedAt: null,
      });

      return this.toDTO(created);
    } catch (e: any) {
      // Fallback por si los índices únicos atrapan algo
      if (String(e?.code) === "11000") {
        throw new BadRequestException("Ya existe una cuenta con ese nombre o código en esta sucursal");
      }
      throw e;
    }
  }

  async findAll(params: {
    branchId: string;
    active?: boolean;
    type?: string;
    q?: string;
    includeDeleted?: boolean;
  }): Promise<FinanceAccountDTO[]> {
    const filter: any = {};
    filter.branchId = ensureBranchObjectId(params.branchId);

    if (!params.includeDeleted) {
      filter.deletedAt = null;
    }
    
    if (typeof params.active === "boolean") {
      filter.isActive = params.active;
    }

    if (params.type) {
      filter.type = params.type;
    }

    if (params.q?.trim()) {
      const qq = params.q.trim();
      const esc = qq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: esc, $options: "i" } },
        { code: { $regex: esc, $options: "i" } },
      ];
    }

    const rows = await this.accountModel
      .find(filter)
      .collation({ locale: "en", strength: 2 })
      .sort({ type: 1, name: 1 })
      .lean();

    return rows.map((r) => this.toDTO(r));
  }

  async findOne(params: { branchId: string; id: string }): Promise<FinanceAccountDTO> {
    const { branchId, id } = params;
    
    ensureValidObjectId(id, "ID de cuenta");

    const row = await this.accountModel
      .findOne({
        _id: id,
        branchId: ensureBranchObjectId(branchId),
        deletedAt: null,
      })
      .lean();

    if (!row) {
      throw new NotFoundException("Cuenta no encontrada");
    }
    
    return this.toDTO(row);
  }

  async update(params: { 
    branchId: string; 
    id: string; 
    dto: UpdateFinanceAccountDto 
  }): Promise<FinanceAccountDTO> {
    const { branchId, id, dto } = params;
    
    const row = await this.findAccountOrThrow(branchId, id);

    // Validar unicidad de code si se está cambiando
    if (dto.code !== undefined) {
      const code = normCode(dto.code);
      if (!code) {
        throw new BadRequestException("El código no puede estar vacío");
      }
      
      if (code !== row.code) {
        const existing = await this.accountModel.findOne({
          branchId: row.branchId,
          code,
          deletedAt: null,
          _id: { $ne: row._id },
        });
        
        if (existing) {
          throw new BadRequestException(`Ya existe una cuenta con el código "${code}" en esta sucursal`);
        }
      }
      
      row.code = code;
    }

    // Validar unicidad de name si se está cambiando
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("El nombre no puede estar vacío");
      }
      
      if (name !== row.name) {
        const existing = await this.accountModel.findOne({
          branchId: row.branchId,
          name,
          deletedAt: null,
          _id: { $ne: row._id },
        });
        
        if (existing) {
          throw new BadRequestException(`Ya existe una cuenta con el nombre "${name}" en esta sucursal`);
        }
      }
      
      row.name = name;
    }

    if (dto.type !== undefined) {
      row.type = dto.type;
    }

    if (dto.currency !== undefined) {
      row.currency = normCurrency(dto.currency);
    }

    if (dto.openingBalance !== undefined) {
      row.openingBalance = dto.openingBalance;
    }

    if (dto.requiresClosing !== undefined) {
      row.requiresClosing = dto.requiresClosing;
    }

    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    if (dto.notes !== undefined) {
      row.notes = dto.notes ?? null;
    }

    try {
      await row.save();
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        throw new BadRequestException("Ya existe una cuenta con ese nombre o código en esta sucursal");
      }
      throw e;
    }

    return this.toDTO(row.toObject());
  }

  async archive(params: { branchId: string; id: string }): Promise<{ ok: boolean }> {
    const { branchId, id } = params;
    const row = await this.findAccountOrThrow(branchId, id);
    
    row.isActive = false;
    await row.save();
    
    return { ok: true };
  }

  async restore(params: { branchId: string; id: string }): Promise<{ ok: boolean }> {
    const { branchId, id } = params;
    const row = await this.findAccountOrThrow(branchId, id);
    
    row.isActive = true;
    await row.save();
    
    return { ok: true };
  }

  async softDelete(params: { branchId: string; id: string }): Promise<{ ok: boolean }> {
    const { branchId, id } = params;
    const row = await this.findAccountOrThrow(branchId, id);
    
    row.isActive = false;
    row.deletedAt = new Date();
    await row.save();
    
    return { ok: true };
  }

  // =====================
  // MÉTODOS PRIVADOS
  // =====================

  private async findAccountOrThrow(
    branchId: string, 
    id: string
  ): Promise<FinanceAccountDocument> {
    ensureValidObjectId(id, "ID de cuenta");

    const row = await this.accountModel.findOne({
      _id: id,
      branchId: ensureBranchObjectId(branchId),
      deletedAt: null,
    });

    if (!row) {
      throw new NotFoundException("Cuenta no encontrada");
    }

    return row;
  }

  private toDTO(row: any): FinanceAccountDTO {
    return {
      id: String(row._id),
      branchId: row.branchId ? String(row.branchId) : null,
      code: row.code,
      name: row.name,
      type: row.type,
      currency: row.currency ?? "ARS",
      openingBalance: Number(row.openingBalance ?? 0),
      requiresClosing: row.requiresClosing ?? true,
      isActive: !!row.isActive,
      notes: row.notes ?? null,
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
    };
  }
}