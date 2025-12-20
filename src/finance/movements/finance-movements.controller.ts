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
import { FinanceMovementsService } from './finance-movements.service';
import { CreateFinanceMovementDto } from './dto/create-finance-movement.dto';
import { UpdateFinanceMovementDto } from './dto/update-finance-movement.dto';
import { FinanceMovementType } from './schemas/finance-movement.schema';

@UseGuards(JwtAuthGuard)
@Controller('finance/movements')
export class FinanceMovementsController {
  constructor(private readonly service: FinanceMovementsService) {}

  @Get()
  @Roles('ADMIN', 'CASHIER')
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: FinanceMovementType,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAll({
      from,
      to,
      type,
      accountId,
      categoryId,
      q,
      limit: limit ? Number(limit) : 50,
      page: page ? Number(page) : 1,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'CASHIER')
  getOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'CASHIER')
  create(@CurrentUser() u: any, @Body() dto: CreateFinanceMovementDto) {
    const userId = String(u?.id || u?.userId || '');
    const roles = (u?.roles || []) as string[];
    return this.service.create(userId, roles, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'CASHIER')
  update(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() dto: UpdateFinanceMovementDto,
  ) {
    const roles = (u?.roles || []) as string[];
    return this.service.update(id, roles, dto);
  }

  @Post(':id/void')
  @Roles('ADMIN', 'CASHIER')
  void(@Param('id') id: string, @CurrentUser() u: any) {
    const roles = (u?.roles || []) as string[];
    return this.service.void(id, roles);
  }
}
