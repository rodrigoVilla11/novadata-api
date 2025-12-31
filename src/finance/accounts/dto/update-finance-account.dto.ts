import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { FinanceAccountType } from "../schemas/finance-account.schema";

export class UpdateFinanceAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsEnum(FinanceAccountType)
  type?: FinanceAccountType;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsBoolean()
  requiresClosing?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}
