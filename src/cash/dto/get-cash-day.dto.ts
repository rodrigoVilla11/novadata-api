import { IsOptional, IsString, MaxLength } from "class-validator";

export class GetCashDayDto {
  @IsString()
  @MaxLength(10)
  dateKey: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  branchId?: string;
}
