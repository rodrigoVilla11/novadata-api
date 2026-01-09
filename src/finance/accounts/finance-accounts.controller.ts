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
import { Roles } from 'src/auth/roles.decorator';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { FinanceAccountsService } from './finance-accounts.service';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { UpdateFinanceAccountDto } from './dto/update-finance-account.dto';
import { FinanceAccountType } from './schemas/finance-account.schema';
import { RolesGuard } from 'src/auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance/accounts')
export class FinanceAccountsController {
  constructor(private readonly service: FinanceAccountsService) {}

  private getBranchIdOrThrow(u: any) {
    const branchId = String(u?.branchId || '');
    if (!branchId) throw new BadRequestException('branchId faltante en el usuario');
    return branchId;
  }

  private getUserId(u: any) {
    return String(u?.id || u?.userId || u?._id || '');
  }

  @Get()
  @Roles('ADMIN', 'CASHIER')
  list(
    @CurrentUser() u: any,
    @Query('active') active?: string,
    @Query('type') type?: FinanceAccountType,
    @Query('q') q?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(u);

    const activeBool =
      active === undefined
        ? undefined
        : active === 'true'
          ? true
          : active === 'false'
            ? false
            : undefined;

    return this.service.findAll({
      branchId,
      active: activeBool,
      type,
      q,
      includeDeleted: false,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'CASHIER')
  getOne(@CurrentUser() u: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.findOne({ branchId, id });
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() u: any, @Body() dto: CreateFinanceAccountDto) {
    const branchId = this.getBranchIdOrThrow(u);
    const userId = this.getUserId(u);

    if (!userId) throw new BadRequestException('userId faltante en el usuario');

    return this.service.create({ userId, branchId, dto });
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateFinanceAccountDto) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.update({ branchId, id, dto });
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  archive(@CurrentUser() u: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.archive({ branchId, id });
  }

  @Post(':id/restore')
  @Roles('ADMIN')
  restore(@CurrentUser() u: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.restore({ branchId, id });
  }

  @Post(':id/delete')
  @Roles('ADMIN')
  softDelete(@CurrentUser() u: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.softDelete({ branchId, id });
  }
}
