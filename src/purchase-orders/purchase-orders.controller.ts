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
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "src/auth/roles.decorator";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { PurchaseOrderStatus } from "./enums/purchase-order.enums";
import { ReceivePurchaseOrderDto } from "./dto/receive.dto";
import { AttachInvoiceDto } from "./dto/attach-invoice.dto";

@Controller("purchase-orders")
@UseGuards(AuthGuard("jwt"))
@Roles("ADMIN", "MANAGER", "CASHIER")
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query("supplierId") supplierId?: string,
    @Query("status") status?: PurchaseOrderStatus,
    @Query("limit") limit?: string,
  ) {
    return this.service.findAll({
      supplierId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: { status: PurchaseOrderStatus }) {
    return this.service.setStatus(id, dto.status);
  }

  @Patch(":id/receive")
  receive(@Req() req: any, @Param("id") id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.service.receive(id, {
      ...dto,
      userId: req?.user?.id ?? req?.user?._id ?? null,
    });
  }

  @Patch(":id/invoice")
  attachInvoice(@Param("id") id: string, @Body() dto: AttachInvoiceDto) {
    return this.service.attachInvoice(id, dto);
  }
}
