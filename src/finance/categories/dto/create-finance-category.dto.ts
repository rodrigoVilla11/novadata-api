import { 
  IsBoolean, 
  IsEnum, 
  IsInt, 
  IsOptional, 
  IsString, 
  Length,
  Matches,
  Min 
} from "class-validator";
import { 
  FinanceCategoryDirection, 
  FinanceCategoryType 
} from "../schemas/finance-category.schema";

export class CreateFinanceCategoryDto {
  @IsString()
  @Length(1, 40, { message: "El código debe tener entre 1 y 40 caracteres" })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: "El código solo puede contener letras, números, guiones y guiones bajos",
  })
  code!: string;

  @IsString()
  @Length(1, 80, { message: "El nombre debe tener entre 1 y 80 caracteres" })
  name!: string;

  @IsEnum(FinanceCategoryType, {
    message: `El tipo debe ser: ${Object.values(FinanceCategoryType).join(", ")}`,
  })
  type!: FinanceCategoryType;

  @IsEnum(FinanceCategoryDirection, {
    message: `La dirección debe ser: ${Object.values(FinanceCategoryDirection).join(", ")}`,
  })
  direction!: FinanceCategoryDirection;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt({ message: "El orden debe ser un número entero" })
  @Min(0, { message: "El orden no puede ser negativo" })
  order?: number;

  @IsOptional()
  @IsBoolean()
  affectsProfit?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInStats?: boolean;
}