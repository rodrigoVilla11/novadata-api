import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { FinanceAccountType } from "../schemas/finance-account.schema";

export class UpdateFinanceAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsEnum(FinanceAccountType)
  type?: FinanceAccountType;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  currency?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}
