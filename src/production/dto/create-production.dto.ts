import { IsMongoId, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateProductionDto {
  @IsMongoId()
  employeeId: string;

  @IsMongoId()
  taskId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
