import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StockService } from './stock.service';
import { StockMovementReason, StockMovementType } from './enums/stock.enums';
import { Roles } from 'src/auth/roles.decorator';

@Controller('stock')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER', 'CASHIER')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /**
   * POST /stock/sale
   * Aplica una venta (descuenta ingredientes según recetas)
   */
  @Post('sale')
  applySale(@Req() req: any, @Body() body: any) {
    return this.stockService.applySale({
      dateKey: body?.dateKey,
      saleId: body?.saleId,
      lines: body?.lines ?? [],
      note: body?.note ?? null,
      userId: req?.user?._id ? String(req.user._id) : null,
    });
  }

  /**
   * POST /stock/sale-reversal
   * Revierte una venta (devuelve ingredientes)
   */
  @Post('sale-reversal')
  applySaleReversal(@Req() req: any, @Body() body: any) {
    return this.stockService.applySaleReversal({
      dateKey: body?.dateKey,
      saleId: body?.saleId,
      lines: body?.lines ?? [],
      note: body?.note ?? null,
      userId: req?.user?._id ? String(req.user._id) : null,
    });
  }

  /**
   * POST /stock/manual
   * Movimientos manuales: compras, merma, ajustes, etc.
   */
  @Post('manual')
  applyManual(@Req() req: any, @Body() body: any) {
    return this.stockService.applyManual({
      dateKey: body?.dateKey,
      type: body?.type as StockMovementType,
      reason: body?.reason as StockMovementReason,
      refType: body?.refType ?? null,
      refId: body?.refId ?? null, // ObjectId string (si querés idempotencia)
      items: body?.items ?? [],
      note: body?.note ?? null,
      userId: req?.user?._id ? String(req.user._id) : null,
    });
  }

  /**
   * GET /stock/balances?ingredientId=<id?>
   * Balance actual (rápido) desde Ingredient.stock.onHand
   */
  @Get('balances')
  getBalances(@Query('ingredientId') ingredientId?: string) {
    return this.stockService.getBalances({
      ingredientId: ingredientId?.trim() ? ingredientId.trim() : null,
    });
  }

  /**
   * GET /stock/movements?dateKey=YYYY-MM-DD&ingredientId=&refType=&refId=&limit=
   * Auditoría de movimientos
   */
  @Get('movements')
  listMovements(
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
    });
  }
}
