// src/purchase-orders/dto/receive.dto.ts
import { IsArray, IsMongoId, IsNumber, IsOptional, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ReceiveItemDto {
  @IsMongoId()
  ingredientId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  receivedQty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  realUnitPrice?: number;
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
}
