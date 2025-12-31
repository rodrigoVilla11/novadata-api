import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { FinanceCategoryDirection, FinanceCategoryType } from "../schemas/finance-category.schema";

export class CreateFinanceCategoryDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  // legacy/compat
  @IsEnum(FinanceCategoryType)
  type!: FinanceCategoryType;

  // nuevo
  @IsEnum(FinanceCategoryDirection)
  direction!: FinanceCategoryDirection;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  affectsProfit?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInStats?: boolean;
}
