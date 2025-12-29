// src/stock/stock.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { StockService } from './stock.service';
import { StockMovementReason, StockMovementType } from './enums/stock.enums';

@Controller('stock')
@UseGuards(AuthGuard('jwt'))
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /**
   * POST /stock/sale
   * Aplica consumo automático por venta (POS / online).
   * Roles: ADMIN, MANAGER, CASHIER
   */
  @Post('sale')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  async applySale(
    @Body()
    body: {
      dateKey: string;
      saleId: string;
      lines: Array<{ productId: string; qty: number }>;
      note?: string | null;
      userId?: string | null;
    },
  ) {
    return this.stockService.applySale({
      dateKey: body.dateKey,
      saleId: body.saleId,
      lines: body.lines,
      note: body.note ?? null,
      userId: body.userId ?? null,
      // branchId: NO por ahora
    });
  }

  /**
   * POST /stock/manual
   * Aplica movimientos manuales (compras, merma, ajustes, carga inicial)
   * Roles: ADMIN, MANAGER
   */
  @Post('manual')
  @Roles('ADMIN', 'MANAGER')
  async applyManual(
    @Body()
    body: {
      dateKey: string;

      type: StockMovementType;
      reason: StockMovementReason;

      refType?: string | null;
      refId?: string | null;

      items: Array<{
        ingredientId: string;
        qty: number; // IN/OUT: positivo; ADJUST: signed
        unit?: any; // Unit (opcional)
        note?: string | null;
      }>;

      note?: string | null;
      userId?: string | null;
    },
  ) {
    return this.stockService.applyManual({
      dateKey: body.dateKey,
      type: body.type,
      reason: body.reason,
      refType: body.refType ?? null,
      refId: body.refId ?? null,
      items: body.items ?? [],
      note: body.note ?? null,
      userId: body.userId ?? null,
      // branchId: NO por ahora
    });
  }

  /**
   * GET /stock/balances
   * ?ingredientId=...
   * Roles: ADMIN, MANAGER, CASHIER
   */
  @Get('balances')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  async balances(@Query('ingredientId') ingredientId?: string) {
    return this.stockService.getBalances({
      ingredientId: ingredientId?.trim() ? ingredientId.trim() : null,
      // branchId: NO por ahora
    });
  }

  /**
   * GET /stock/movements
   * ?dateKey=YYYY-MM-DD&ingredientId=...&refType=SALE&refId=...
   * Roles: ADMIN, MANAGER, CASHIER
   */
  @Get('movements')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  async movements(
    @Query('dateKey') dateKey?: string,
    @Query('ingredientId') ingredientId?: string,
    @Query('refType') refType?: string,
    @Query('refId') refId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockService.listMovements({
      dateKey: dateKey?.trim() ? dateKey.trim() : undefined,
      ingredientId: ingredientId?.trim() ? ingredientId.trim() : null,
      refType: refType?.trim() ? refType.trim() : null,
      refId: refId?.trim() ? refId.trim() : null,
      limit: limit ? Number(limit) : undefined,
      // branchId: NO por ahora
    });
  }
}
