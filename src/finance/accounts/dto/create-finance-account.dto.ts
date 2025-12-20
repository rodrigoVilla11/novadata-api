import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { FinanceAccountType } from "../schemas/finance-account.schema";

export class CreateFinanceAccountDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsEnum(FinanceAccountType)
  type!: FinanceAccountType;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  currency?: string; // default ARS

  @IsOptional()
  @IsNumber()
  openingBalance?: number; // default 0

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}
