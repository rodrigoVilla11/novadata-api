import {
  BadRequestException,
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

import { OrdersService } from './orders.service';
import { OrderFulfillment, OrderStatus } from './schemas/order.schema';

function pickBranchId(req: any) {
  const b =
    req?.user?.branchId ??
    req?.user?.branch_id ??
    req?.user?.branch?.id ??
    null;

  const s = String(b ?? '').trim();
  return s ? s : null;
}

@Controller('orders')
@UseGuards(AuthGuard('jwt'))
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  create(
    @Req() req: any,
    @Body()
    body: {
      source: 'POS' | 'ONLINE';
      fulfillment?: OrderFulfillment | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
      customerId?: string | null;
      customerSnapshot?: {
        name?: string | null;
        phone?: string | null;
        addressLine1?: string | null;
        addressLine2?: string | null;
        notes?: string | null;
      } | null;
      note?: string | null;
      items?: Array<{ productId: string; qty: number; note?: string | null }>;
    },
  ) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.create({
      branchId,
      ...body,
    });
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findAll(
    @Req() req: any,
    @Query('dateKey') dateKey?: string,
    @Query('status') status?: OrderStatus,
    @Query('source') source?: 'POS' | 'ONLINE',
    @Query('fulfillment') fulfillment?: OrderFulfillment,
    @Query('customerId') customerId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.findAll({
      branchId,
      status,
      dateKey,
      source,
      fulfillment,
      customerId,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findOne(@Req() req: any, @Param('id') id: string) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.findOne(branchId, id);
  }

  @Patch(':id/items')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  setItems(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      items: Array<{ productId: string; qty: number; note?: string | null }>;
    },
  ) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.setItems(branchId, id, body.items ?? []);
  }

  @Patch(':id/note')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  setNote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { note?: string | null },
  ) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.setNote(branchId, id, body.note ?? null);
  }

  @Patch(':id/fulfillment')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  setFulfillment(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      fulfillment: OrderFulfillment | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
    },
  ) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.setFulfillment(branchId, id, body.fulfillment);
  }

  @Patch(':id/customer-snapshot')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  setCustomerSnapshot(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      customerSnapshot: {
        name?: string | null;
        phone?: string | null;
        addressLine1?: string | null;
        addressLine2?: string | null;
        notes?: string | null;
      } | null;
    },
  ) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.setCustomerSnapshot(
      branchId,
      id,
      body.customerSnapshot ?? null,
    );
  }

  @Post(':id/accept')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  accept(@Req() req: any, @Param('id') id: string) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.accept(branchId, id);
  }

  @Post(':id/reject')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  reject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string | null },
  ) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.reject(branchId, id, body.reason ?? null);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'CUSTOMER')
  cancel(@Req() req: any, @Param('id') id: string) {
    const branchId = pickBranchId(req);
    if (!branchId) throw new BadRequestException('branchId missing in token');

    return this.ordersService.cancel(branchId, id);
  }
}
