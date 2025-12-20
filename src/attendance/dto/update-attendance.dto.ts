import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdateAttendanceDto {
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
