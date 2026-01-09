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

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId ? String(req.user.branchId) : "";
    if (!branchId) throw new BadRequestException("branchId is required");
    return branchId;
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreatePurchaseOrderDto) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.create({ ...dto, branchId });
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query("supplierId") supplierId?: string,
    @Query("status") status?: PurchaseOrderStatus,
    @Query("limit") limit?: string
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    return this.service.findAll({
      branchId,
      supplierId: supplierId?.trim() ? supplierId.trim() : undefined,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(":id")
  findOne(@Req() req: any, @Param("id") id: string) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.findOne(branchId, id);
  }

  @Patch(":id/status")
  setStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: { status: PurchaseOrderStatus }
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.setStatus(branchId, id, dto.status);
  }

  @Patch(":id/receive")
  receive(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: ReceivePurchaseOrderDto
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    return this.service.receive(id, {
      ...dto,
      branchId,
      userId: req?.user?.id ?? req?.user?._id ?? null,
    });
  }

  @Patch(":id/invoice")
  attachInvoice(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: AttachInvoiceDto
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.attachInvoice(branchId, id, dto);
  }
}
