import { IsOptional, IsString, MaxLength } from "class-validator";

export class ListStockMovementsDto {
  @IsOptional()
  @IsString()
  ingredientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  dateFrom?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  @MaxLength(10)
  dateTo?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  refType?: string;

  @IsOptional()
  @IsString()
  refId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
