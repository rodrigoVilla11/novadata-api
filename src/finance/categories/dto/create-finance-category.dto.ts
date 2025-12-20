import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { FinanceCategoryType } from "../schemas/finance-category.schema";

export class CreateFinanceCategoryDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsEnum(FinanceCategoryType)
  type!: FinanceCategoryType;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
