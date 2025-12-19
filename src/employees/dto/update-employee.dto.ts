import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsOptional()
  isActive?: boolean;
}
