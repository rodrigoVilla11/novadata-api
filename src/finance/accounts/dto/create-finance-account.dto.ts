import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { FinanceAccountType } from '../schemas/finance-account.schema';

export const VALID_CURRENCIES = ['ARS', 'USD', 'EUR', 'BRL', 'CLP'] as const;
export class CreateFinanceAccountDto {
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'El código solo puede contener letras minúsculas, números, guiones y guiones bajos',
  })
  code!: string; // ej: "mp", "cash", "santander"

  @IsString()
  @Length(1, 60) 
  name!: string;

  @IsEnum(FinanceAccountType)
  type!: FinanceAccountType;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsIn(VALID_CURRENCIES, { message: 'Moneda no soportada' })
  currency?: string; // ARS, USD, EUR

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingBalance?: number; // default 0

  @IsOptional()
  @IsBoolean()
  requiresClosing?: boolean; // default true

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}
