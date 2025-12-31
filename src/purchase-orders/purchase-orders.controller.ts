// src/purchase-orders/purchase-orders.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { SetPurchaseOrderStatusDto } from "./dto/set-status.dto";
import { ReceivePurchaseOrderDto } from "./dto/receive.dto";
import { AttachInvoiceDto } from "./dto/attach-invoice.dto";
import { PurchaseOrderStatus } from "./enums/purchase-order.enums";

@Controller("purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.service.create(dto);
  }

  @Get()
  list(
    @Query("supplierId") supplierId?: string,
    @Query("status") status?: PurchaseOrderStatus,
    @Query("limit") limit?: string,
  ) {
    return this.service.findAll({ supplierId, status, limit: Number(limit) });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: SetPurchaseOrderStatusDto) {
    return this.service.setStatus(id, dto.status);
  }

  @Patch(":id/receive")
  receive(@Param("id") id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.service.receive(id, dto);
  }

  @Patch(":id/invoice")
  attachInvoice(@Param("id") id: string, @Body() dto: AttachInvoiceDto) {
    return this.service.attachInvoice(id, dto);
  }
}
