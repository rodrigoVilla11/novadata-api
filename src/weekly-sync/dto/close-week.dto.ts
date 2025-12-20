import { IsOptional, IsString } from "class-validator";

export class CloseWeekDto {
  @IsOptional()
  @IsString()
  summary?: string;
}
