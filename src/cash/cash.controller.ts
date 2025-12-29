import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { CashService } from './cash.service';
import { GetCashDayDto } from './dto/get-cash-day.dto';
import { OpenCashDayDto } from './dto/open-cash-day.dto';
import { CloseCashDayDto } from './dto/close-cash-day.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { VoidMovementDto } from './dto/void-movement.dto';
import { CashDaySummaryDto } from './dto/cash-day-summary.dto';

@Controller('cash')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER', 'CASHIER')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  // trae o crea la caja del día (1 por dateKey)
  @Get('day')
  async getOrCreateDay(@Req() req: any, @Query() q: GetCashDayDto) {
    return this.cashService.getOrCreateDay(req.user, q.dateKey, q.branchId);
  }

  // apertura explícita (setea openingCash)
  @Post('day/open')
  async open(@Req() req: any, @Body() dto: OpenCashDayDto) {
    return this.cashService.openDay(req.user, dto);
  }

  // cierre con arqueo
  @Post('day/close')
  async close(@Req() req: any, @Body() dto: CloseCashDayDto) {
    return this.cashService.closeDay(req.user, dto);
  }

  // reabrir (ADMIN)
  @Post('day/reopen')
  @Roles('ADMIN')
  async reopen(
    @Req() req: any,
    @Body() body: { dateKey: string; branchId?: string; note?: string },
  ) {
    return this.cashService.reopenDay(
      req.user,
      body.dateKey,
      body.branchId,
      body.note,
    );
  }

  // movimientos
  @Get('movements')
  async listMovements(@Query('cashDayId') cashDayId: string) {
    return this.cashService.listMovements(cashDayId);
  }

  @Post('movements')
  async createMovement(@Req() req: any, @Body() dto: CreateMovementDto) {
    return this.cashService.createMovement(req.user, dto);
  }

  @Patch('movements/:id/void')
  async voidMovement(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: VoidMovementDto,
  ) {
    return this.cashService.voidMovement(req.user, id, dto.reason);
  }

  @Get('day/summary')
  async summary(@Req() req: any, @Query() q: CashDaySummaryDto) {
    return this.cashService.getDaySummary(req.user, q.dateKey);
  }
}
