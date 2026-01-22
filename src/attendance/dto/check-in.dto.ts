import { IsMongoId, IsOptional, IsString, Matches } from 'class-validator';

export class CheckInDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateKey inválido (usar YYYY-MM-DD)',
  })
  dateKey: string;

  @IsMongoId()
  employeeId: string;

  @IsMongoId()
  branchId: string;

  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
