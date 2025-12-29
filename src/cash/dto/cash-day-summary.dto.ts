import { IsString, MaxLength } from "class-validator";

export class CashDaySummaryDto {
  @IsString()
  @MaxLength(10)
  dateKey: string; // YYYY-MM-DD
}
