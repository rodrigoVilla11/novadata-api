import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested, IsIn } from "class-validator";
import { Type } from "class-transformer";
import { ComboPricingType } from "../schemas/combo.schema";

type Currency = "ARS" | "USD";

export class ComboItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(1)
  qty: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreateComboDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsEnum(ComboPricingType)
  pricingType: ComboPricingType;

  @IsNumber()
  @Min(0)
  pricingValue: number;

  @IsOptional()
  @IsIn(["ARS", "USD"])
  currency?: Currency;

  @IsOptional()
  @IsString()
  activeFrom?: string | null; // ISO

  @IsOptional()
  @IsString()
  activeTo?: string | null; // ISO

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  items: ComboItemDto[];
}

export class UpdateComboDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsEnum(ComboPricingType)
  pricingType?: ComboPricingType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricingValue?: number;

  @IsOptional()
  @IsIn(["ARS", "USD"])
  currency?: Currency;

  @IsOptional()
  @IsString()
  activeFrom?: string | null;

  @IsOptional()
  @IsString()
  activeTo?: string | null;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  items?: ComboItemDto[];
}

export class SetActiveDto {
  @IsNumber()
  isActive: boolean;
}
