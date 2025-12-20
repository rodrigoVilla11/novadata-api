import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import type { WeeklyMessageType } from "../schemas/weekly-message.schema";

export class CreateWeeklyMessageDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @IsIn(["avance", "error", "mejora", "bloqueo", "decision", "otro"])
  type?: WeeklyMessageType;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsString()
  task_id?: string | null;
}
