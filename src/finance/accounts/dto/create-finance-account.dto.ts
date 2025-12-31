import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from "class-validator";
import { FinanceAccountType } from "../schemas/finance-account.schema";

export class CreateFinanceAccountDto {
  @IsString()
  @MaxLength(40)
  code!: string; // ej: "mp", "cash", "santander"

  @IsString()
  @MaxLength(60)
  name!: string;

  @IsEnum(FinanceAccountType)
  type!: FinanceAccountType;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string; // ARS, USD, EUR

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openingBalance?: number; // default 0

  @IsOptional()
  @IsBoolean()
  requiresClosing?: boolean; // default true

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}
