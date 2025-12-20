import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { Roles } from '../auth/roles.decorator';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary.dto';

@Controller('attendance')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // GET /attendance?dateKey=YYYY-MM-DD&employeeId=...
  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(
    @Query('dateKey') dateKey?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.attendanceService.list({ dateKey, employeeId });
  }

  // GET /attendance/day/2025-12-18
  @Get('day/:dateKey')
  @Roles('ADMIN', 'MANAGER')
  listDay(@Param('dateKey') dateKey: string) {
    return this.attendanceService.listDay(dateKey);
  }

  // PUT /attendance/checkin
  @Put('checkin')
  @Roles('ADMIN', 'MANAGER')
  checkIn(@Body() dto: CheckInDto, @Req() req: any) {
    const createdByUserId =
      req?.user?.sub || req?.user?.id || req?.user?._id || null;

    return this.attendanceService.checkIn({
      dateKey: dto.dateKey,
      employeeId: dto.employeeId,
      photoUrl: dto.photoUrl ?? null,
      notes: dto.notes ?? null,
      createdByUserId,
    });
  }

  // PUT /attendance/checkout
  @Put('checkout')
  @Roles('ADMIN', 'MANAGER')
  checkOut(@Body() dto: CheckOutDto, @Req() req: any) {
    const createdByUserId =
      req?.user?.sub || req?.user?.id || req?.user?._id || null;

    return this.attendanceService.checkOut({
      dateKey: dto.dateKey,
      employeeId: dto.employeeId,
      photoUrl: dto.photoUrl ?? null,
      notes: dto.notes ?? null,
      createdByUserId,
    });
  }

  @Get('summary')
  @Roles('ADMIN', 'MANAGER')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  summary(@Query() q: AttendanceSummaryQueryDto) {
    return this.attendanceService.summary(q);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, dto);
  }
}
