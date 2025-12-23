import {
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

@UseGuards(JwtAuthGuard)
@Controller('finance/accounts')
export class FinanceAccountsController {
  constructor(private readonly service: FinanceAccountsService) {}

  @Get()
  @Roles('ADMIN', 'CASHIER')
  list(
    @Query('active') active?: string,
    @Query('type') type?: FinanceAccountType,
    @Query('q') q?: string,
  ) {
    const activeBool =
      active === undefined
        ? undefined
        : active === 'true'
          ? true
          : active === 'false'
            ? false
            : undefined;

    return this.service.findAll({
      active: activeBool,
      type,
      q,
      includeDeleted: false,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'CASHIER')
  getOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() u: any, @Body() dto: CreateFinanceAccountDto) {
    const userId = String(u?.id || u?.userId || '');
    return this.service.create(userId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateFinanceAccountDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }

  @Post(':id/restore')
  @Roles('ADMIN')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Post(':id/delete')
  @Roles('ADMIN')
  softDelete(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
