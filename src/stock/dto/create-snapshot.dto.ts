import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Unit } from "src/ingredients/enums/unit.enum";

class SnapshotItemDto {
  @IsString()
  ingredientId: string;

  @IsString()
  unit: Unit;

  // qty se setea desde el cálculo (no la pedimos al usuario)
}

export class CreateStockSnapshotDto {
  @IsString()
  @MaxLength(10)
  dateKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  // opcional: si querés snapshot solo de algunos ingredientes (si no, snapshot de todos los que aparezcan)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SnapshotItemDto)
  onlyIngredients?: SnapshotItemDto[];
}
