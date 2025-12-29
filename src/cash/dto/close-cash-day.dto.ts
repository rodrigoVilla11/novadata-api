import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CloseCashDayDto {
  @IsString()
  @MaxLength(10)
  dateKey: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  countedCash?: number;

  // si es true, permite cerrar aunque falten datos o haya inconsistencias
  @IsOptional()
  @IsBoolean()
  adminOverride?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
