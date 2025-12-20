import { IsBooleanString, IsMongoId, IsOptional, Matches } from 'class-validator';

const DATEKEY_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

export class AttendanceSummaryQueryDto {
  @Matches(DATEKEY_RE, { message: 'from inválido (usar YYYY-MM-DD)' })
  from: string;

  @Matches(DATEKEY_RE, { message: 'to inválido (usar YYYY-MM-DD)' })
  to: string;

  @IsOptional()
  @IsMongoId({ message: 'employeeId inválido (ObjectId)' })
  employeeId?: string;

  @IsOptional()
  @IsBooleanString()
  onlyActive?: string; // "true" | "false"
}
