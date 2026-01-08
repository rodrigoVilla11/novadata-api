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
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { Roles } from '../auth/roles.decorator';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId;

    if (!branchId) throw new ForbiddenException('Usuario sin branch asignada');
    return String(branchId);
  }

  private getUserId(req: any) {
    return req?.user?.id || req?.user?.userId || req?.user?._id || null;
  }

  // GET /attendance?dateKey=YYYY-MM-DD&employeeId=...
  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(
    @Query('dateKey') dateKey: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @Req() req: any,
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.attendanceService.list({ branchId, dateKey, employeeId });
  }

  // GET /attendance/day/2025-12-18
  @Get('day/:dateKey')
  @Roles('ADMIN', 'MANAGER')
  listDay(@Param('dateKey') dateKey: string, @Req() req: any) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.attendanceService.listDay({ branchId, dateKey });
  }

  // PUT /attendance/checkin
  @Put('checkin')
  @Roles('ADMIN', 'MANAGER')
  checkIn(@Body() dto: CheckInDto, @Req() req: any) {
    const branchId = this.getBranchIdOrThrow(req);
    const createdByUserId = this.getUserId(req);

    return this.attendanceService.checkIn({
      branchId,
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
    const branchId = this.getBranchIdOrThrow(req);
    const createdByUserId = this.getUserId(req);

    return this.attendanceService.checkOut({
      branchId,
      dateKey: dto.dateKey,
      employeeId: dto.employeeId,
      photoUrl: dto.photoUrl ?? null,
      notes: dto.notes ?? null,
      createdByUserId,
    });
  }

  // GET /attendance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&onlyActive=true
  @Get('summary')
  @Roles('ADMIN', 'MANAGER')
  summary(@Query() q: AttendanceSummaryQueryDto, @Req() req: any) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.attendanceService.summary({ branchId, q });
  }

  // PATCH /attendance/:id
  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @Req() req: any,
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.attendanceService.update({ branchId, id, dto });
  }
}
