import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';

import { CashService } from './cash.service';
import { OpenCashDayDto } from './dto/open-cash-day.dto';
import { CloseCashDayDto } from './dto/close-cash-day.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

@Controller('cash')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER', 'CASHIER')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  // --------------------------------
  // Day
  // --------------------------------

  // GET /cash/day?dateKey=YYYY-MM-DD&branchId=...
  @Get('day')
  async getDay(
    @Query('dateKey') dateKey: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.cashService.getDayByDateKey(dateKey, branchId);
  }

  // POST /cash/day/get-or-create
  @Post('day/get-or-create')
  async getOrCreate(
    @Req() req: any,
    @Body() body: { dateKey: string; branchId?: string },
  ) {
    return this.cashService.getOrCreateDay(req.user, body.dateKey, body.branchId);
  }

  // POST /cash/day/open
  @Post('day/open')
  async openDay(@Req() req: any, @Body() dto: OpenCashDayDto) {
    return this.cashService.openDay(req.user, dto);
  }

  // POST /cash/day/close
  @Post('day/close')
  async closeDay(@Req() req: any, @Body() dto: CloseCashDayDto) {
    return this.cashService.closeDay(req.user, dto);
  }

  // POST /cash/day/reopen?dateKey=...&branchId=...&note=...
  @Post('day/reopen')
  @Roles('ADMIN') // además del check interno
  async reopenDay(
    @Req() req: any,
    @Query('dateKey') dateKey: string,
    @Query('branchId') branchId?: string,
    @Query('note') note?: string,
  ) {
    return this.cashService.reopenDay(req.user, dateKey, branchId, note);
  }

  // GET /cash/summary?dateKey=...&branchId=...
  @Get('summary')
  async summary(
    @Req() req: any,
    @Query('dateKey') dateKey: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.cashService.getDaySummary(req.user, dateKey, branchId);
  }

  // --------------------------------
  // Movements
  // --------------------------------

  // GET /cash/movements/:cashDayId
  @Get('movements/:cashDayId')
  async listMovements(@Param('cashDayId') cashDayId: string) {
    return this.cashService.listMovements(cashDayId);
  }

  // POST /cash/movement
  @Post('movement')
  async createMovement(@Req() req: any, @Body() dto: CreateMovementDto) {
    return this.cashService.createMovement(req.user, dto);
  }

  // POST /cash/movement/:id/void
  @Post('movement/:id/void')
  async voidMovement(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.cashService.voidMovement(req.user, id, body?.reason);
  }
}
