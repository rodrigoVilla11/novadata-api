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

import { SaleStatus } from './schemas/sale.schema';
import { PaymentMethod } from 'src/cash/schemas/cash-movement.schema';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER', 'CASHIER')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('from-order/:orderId')
  createFromOrder(@Req() req: any, @Param('orderId') orderId: string) {
    return this.salesService.createFromOrder(req.user, orderId);
  }

  @Get()
  findAll(
    @Query('status') status?: SaleStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.findAll({
      status,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

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
    return this.salesService.pay(req.user, id, body);
  }

  @Patch(':id/void')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  voidSale(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string | null; dateKey?: string | null },
  ) {
    return this.salesService.voidSale(
      req.user,
      id,
      body.reason ?? null,
      body.dateKey ?? null,
    );
  }
}
