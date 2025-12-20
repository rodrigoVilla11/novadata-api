import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ClosingBalanceDto {
  @IsString()
  accountId!: string;

  @IsNumber()
  balance!: number;
}

export class UpsertDayClosingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClosingBalanceDto)
  declaredBalances!: ClosingBalanceDto[];

  @IsOptional()
  @IsString()
  notes?: string | null;
}
