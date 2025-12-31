import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, IsIn } from "class-validator";
import { FinanceMovementDirection, FinanceMovementSource } from "../schemas/finance-movement.schema";

export class CreateFinanceMovementDto {
  @IsString()
  dateKey!: string;

  @IsEnum(FinanceMovementDirection)
  direction!: FinanceMovementDirection;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsIn([1, -1])
  adjustmentSign?: 1 | -1;

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
  source?: FinanceMovementSource;

  @IsOptional()
  @IsString()
  sourceRef?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string | null;
}
