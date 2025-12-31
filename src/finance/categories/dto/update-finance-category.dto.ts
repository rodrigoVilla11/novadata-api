import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { FinanceCategoryDirection, FinanceCategoryType } from "../schemas/finance-category.schema";

export class UpdateFinanceCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(FinanceCategoryType)
  type?: FinanceCategoryType;

  @IsOptional()
  @IsEnum(FinanceCategoryDirection)
  direction?: FinanceCategoryDirection;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  affectsProfit?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInStats?: boolean;
}
