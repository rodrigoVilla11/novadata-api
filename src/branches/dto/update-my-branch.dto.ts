import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  Matches,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Validador HH:mm (00:00 a 23:59)
 */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TimeRangeDto {
  @IsString()
  @Matches(HHMM, { message: "open must be HH:mm" })
  open!: string;

  @IsString()
  @Matches(HHMM, { message: "close must be HH:mm" })
  close!: string;
}

export class DayScheduleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  ranges?: TimeRangeDto[];
}

export class WeekScheduleDto {
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  mon?: DayScheduleDto;
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  tue?: DayScheduleDto;
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  wed?: DayScheduleDto;
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  thu?: DayScheduleDto;
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  fri?: DayScheduleDto;
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  sat?: DayScheduleDto;
  @IsOptional() @ValidateNested() @Type(() => DayScheduleDto)
  sun?: DayScheduleDto;
}

/**
 * ✅ DTO para que cada sucursal edite SOLO sus datos
 * (sin plan, sin deletedAt, etc.)
 */
export class UpdateMyBranchDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  // Si NO querés que un admin desactive/active la sucursal, eliminá este campo.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsapp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  gps?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WeekScheduleDto)
  schedule?: WeekScheduleDto;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string | null;
}
