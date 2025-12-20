import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { FinanceMovementType } from "../schemas/finance-movement.schema";

export class UpdateFinanceMovementDto {
  @IsOptional()
  @IsString()
  dateKey?: string;

  @IsOptional()
  @IsEnum(FinanceMovementType)
  type?: FinanceMovementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  toAccountId?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  providerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string | null;

  @IsOptional()
  @IsString()
  status?: "POSTED" | "VOID";
}
