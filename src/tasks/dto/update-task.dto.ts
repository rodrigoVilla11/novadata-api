import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string | null;
}
