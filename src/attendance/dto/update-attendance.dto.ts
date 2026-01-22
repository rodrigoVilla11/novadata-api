import { IsOptional, IsString, IsDateString, IsMongoId } from 'class-validator';

export class UpdateAttendanceDto {
  @IsMongoId()
  branchId: string;
  
  @IsOptional()
  @IsDateString()
  checkInAt?: string | null;

  @IsOptional()
  @IsDateString()
  checkOutAt?: string | null;

  @IsOptional()
  @IsString()
  checkInPhotoUrl?: string | null;

  @IsOptional()
  @IsString()
  checkOutPhotoUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
