// src/purchase-orders/dto/create-purchase-order.dto.ts
import { IsArray, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Unit } from "src/ingredients/enums/unit.enum";

class CreatePurchaseOrderItemDto {
  @IsMongoId()
  ingredientId: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsEnum(Unit)
  unit: Unit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  approxUnitPrice?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePurchaseOrderDto {
  @IsMongoId()
  supplierId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items?: CreatePurchaseOrderItemDto[];
}
