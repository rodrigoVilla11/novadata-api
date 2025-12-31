// src/purchase-orders/dto/set-status.dto.ts
import { IsEnum } from "class-validator";
import { PurchaseOrderStatus } from "../enums/purchase-order.enums";

export class SetPurchaseOrderStatusDto {
  @IsEnum(PurchaseOrderStatus)
  status: PurchaseOrderStatus;
}
