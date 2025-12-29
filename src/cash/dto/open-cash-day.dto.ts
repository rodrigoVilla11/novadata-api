import { IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class OpenCashDayDto {
  @IsString()
  @MaxLength(10)
  dateKey: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  openingCash?: number;
}
