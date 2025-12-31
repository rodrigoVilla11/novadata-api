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
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';

import { OrdersService } from './orders.service';
import { OrderStatus } from './schemas/order.schema';

@Controller('orders')
@UseGuards(AuthGuard('jwt'))
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /orders
   * - POS: crea DRAFT
   * - ONLINE: crea PENDING
   */
  @Post()
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  create(
    @Body()
    body: {
      source: 'POS' | 'ONLINE';
      customerId?: string | null;
      note?: string | null;
      items?: Array<{ productId: string; qty: number; note?: string | null }>;
    },
  ) {
    return this.ordersService.create(body);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findAll(
    @Query('status') status?: OrderStatus,
    @Query('source') source?: 'POS' | 'ONLINE',
    @Query('customerId') customerId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findAll({
      status,
      source,
      customerId,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  /**
   * PUT /orders/:id/items (uso PATCH por simpleza de tus patrones)
   */
  @Patch(':id/items')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  setItems(
    @Param('id') id: string,
    @Body()
    body: { items: Array<{ productId: string; qty: number; note?: string | null }> },
  ) {
    return this.ordersService.setItems(id, body.items ?? []);
  }

  @Patch(':id/note')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  setNote(@Param('id') id: string, @Body() body: { note?: string | null }) {
    return this.ordersService.setNote(id, body.note ?? null);
  }

  @Post(':id/accept')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  accept(@Param('id') id: string) {
    return this.ordersService.accept(id);
  }

  @Post(':id/reject')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  reject(@Param('id') id: string, @Body() body: { reason?: string | null }) {
    return this.ordersService.reject(id, body.reason ?? null);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  cancel(@Param('id') id: string) {
    return this.ordersService.cancel(id);
  }
}
