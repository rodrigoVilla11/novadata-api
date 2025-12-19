import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateEmployeeDto {
  @IsString()
  fullName: string;

  // ISO date: "2025-12-18"
  @IsDateString()
  hireDate: string;

  @IsNumber()
  @Min(0)
  hourlyRate: number;

  @IsOptional()
  @IsString()
  userId?: string | null;
}
