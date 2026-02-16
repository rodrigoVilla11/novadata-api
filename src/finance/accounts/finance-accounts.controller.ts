import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { FinanceAccountsService } from './finance-accounts.service';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { UpdateFinanceAccountDto } from './dto/update-finance-account.dto';
import { FinanceAccountType } from './schemas/finance-account.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance/accounts')
export class FinanceAccountsController {
  constructor(private readonly service: FinanceAccountsService) {}

  /**
   * Extrae y valida el branchId del usuario actual
   */
  private getBranchIdOrThrow(user: any): string {
    const branchId = String(user?.branchId || '');
    if (!branchId) {
      throw new BadRequestException('branchId faltante en el usuario');
    }
    return branchId;
  }

  /**
   * Extrae el userId del usuario actual
   */
  private getUserIdOrThrow(user: any): string {
    const userId = String(user?.id || user?.userId || user?._id || '');
    if (!userId) {
      throw new BadRequestException('userId faltante en el usuario');
    }
    return userId;
  }

  /**
   * Valida que el tipo de cuenta sea válido
   */
  private validateAccountType(type?: string): void {
    if (type && !Object.values(FinanceAccountType).includes(type as FinanceAccountType)) {
      throw new BadRequestException(
        `Tipo inválido. Debe ser: ${Object.values(FinanceAccountType).join(', ')}`
      );
    }
  }

  /**
   * Parsea el parámetro 'active' de query string a boolean
   */
  private parseActiveParam(active?: string): boolean | undefined {
    if (active === undefined) return undefined;
    if (active === 'true') return true;
    if (active === 'false') return false;
    return undefined;
  }

  @Get()
  @Roles('ADMIN', 'CASHIER')
  async list(
    @CurrentUser() user: any,
    @Query('active') active?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
  ): Promise<any> {
    const branchId = this.getBranchIdOrThrow(user);
    
    // Validar tipo si se proporciona
    this.validateAccountType(type);

    const activeBool = this.parseActiveParam(active);

    return this.service.findAll({
      branchId,
      active: activeBool,
      type: type as FinanceAccountType,
      q: q?.trim() || undefined,
      includeDeleted: false,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'CASHIER')
  async getOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<any> {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException('ID de cuenta es requerido');
    }

    return this.service.findOne({ branchId, id: id.trim() });
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateFinanceAccountDto,
  ): Promise<any> {
    const branchId = this.getBranchIdOrThrow(user);
    const userId = this.getUserIdOrThrow(user);

    return this.service.create({ userId, branchId, dto });
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceAccountDto,
  ): Promise<any> {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException('ID de cuenta es requerido');
    }

    // Validar que el DTO no esté vacío
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un campo para actualizar');
    }

    return this.service.update({ branchId, id: id.trim(), dto });
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  async archive(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<any> {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException('ID de cuenta es requerido');
    }

    return this.service.archive({ branchId, id: id.trim() });
  }

  @Post(':id/restore')
  @Roles('ADMIN')
  async restore(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<any> {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException('ID de cuenta es requerido');
    }

    return this.service.restore({ branchId, id: id.trim() });
  }

  @Post(':id/delete')
  @Roles('ADMIN')
  async softDelete(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<any> {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException('ID de cuenta es requerido');
    }

    return this.service.softDelete({ branchId, id: id.trim() });
  }
}