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
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';

import { SaleStatus } from './schemas/sale.schema';
import { PaymentMethod } from 'src/cash/schemas/cash-movement.schema';
import { SalesService } from './sales.service';

function getBranchIdOrThrow(req: any) {
  const u = req?.user ?? null;

  const branchId =
    u?.branchId ?? u?.branch_id ?? u?.branch?.id ?? u?.branch?.id ?? null;

  // DEBUG (temporal)
  // eslint-disable-next-line no-console
  console.log('[Sales] req.user keys:', u ? Object.keys(u) : null);
  // eslint-disable-next-line no-console
  console.log('[Sales] req.user:', u);

  if (!branchId || String(branchId).trim() === '') {
    // eslint-disable-next-line no-console
    console.log(
      '[Sales] Missing branchId. auth header:',
      req?.headers?.authorization,
    );

    throw new BadRequestException(
      'branchId inválido (missing/empty in req.user). ' +
        'Expected req.user.branchId (JWT payload).',
    );
  }

  return String(branchId);
}

@Controller('sales')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER', 'CASHIER')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  /**
   * POST /sales/from-order/:orderId
   */
  @Post('from-order/:orderId')
  createFromOrder(@Req() req: any, @Param('orderId') orderId: string) {
    const branchId = getBranchIdOrThrow(req);
    return this.salesService.createFromOrder(req.user, branchId, orderId);
  }

  /**
   * GET /sales?status=&from=&to=&limit=
   */
  @Get()
  findAll(
    @Req() req: any,
    @Query('status') status?: SaleStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const branchId = getBranchIdOrThrow(req);
    return this.salesService.findAll(branchId, {
      status,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * GET /sales/:id
   */
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const branchId = getBranchIdOrThrow(req);
    return this.salesService.findOne(branchId, id);
  }

  /**
   * POST /sales/:id/pay
   */
  @Post(':id/pay')
  pay(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      dateKey: string;
      payments: Array<{
        method: PaymentMethod;
        amount: number;
        note?: string | null;
      }>;
      concept?: string;
      note?: string | null;
      categoryId?: string | null;
    },
  ) {
    const branchId = getBranchIdOrThrow(req);
    return this.salesService.pay(req.user, branchId, id, body);
  }

  /**
   * PATCH /sales/:id/void
   * body: { reason?, dateKey? }  (dateKey opcional override)
   */
  @Patch(':id/void')
  voidSale(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string | null; dateKey?: string | null },
  ) {
    const branchId = getBranchIdOrThrow(req);
    return this.salesService.voidSale(
      req.user,
      branchId,
      id,
      body?.reason ?? null,
      body?.dateKey ?? null,
    );
  }
}
