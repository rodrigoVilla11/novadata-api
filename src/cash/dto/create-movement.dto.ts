import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { CashMovementType, PaymentMethod } from "../schemas/cash-movement.schema";

export class CreateMovementDto {
  @IsString()
  cashDayId: string;

  @IsEnum(CashMovementType)
  type: CashMovementType;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  concept?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
