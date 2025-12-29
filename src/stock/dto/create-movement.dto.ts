import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { StockMovementType, StockMovementReason } from "../enums/stock.enums";
import { Unit } from "src/ingredients/enums/unit.enum";

export class CreateStockMovementDto {
  @IsString()
  @MaxLength(10)
  dateKey: string;

  @IsString()
  ingredientId: string;

  @IsEnum(Unit)
  unit: Unit;

  @IsEnum(StockMovementType)
  type: StockMovementType;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsOptional()
  @IsEnum(StockMovementReason)
  reason?: StockMovementReason;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  refType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  refId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
