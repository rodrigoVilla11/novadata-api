import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { FinanceMovementType } from "../schemas/finance-movement.schema";

export class CreateFinanceMovementDto {
  @IsString()
  dateKey!: string; // YYYY-MM-DD

  @IsEnum(FinanceMovementType)
  type!: FinanceMovementType;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  accountId!: string;

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
}
