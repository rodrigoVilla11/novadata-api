import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/roles.decorator';
import { MeService } from './me.service';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

class MeCheckInDto {
  dateKey!: string;               // YYYY-MM-DD
  photoUrl?: string | null;
  notes?: string | null;
}

class MeCheckOutDto {
  dateKey!: string;               // YYYY-MM-DD
  photoUrl?: string | null;
  notes?: string | null;
}
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  me(@CurrentUser() u: any) {
    return this.meService.me(u.userId);
  }

  @Post('attendance/check-in')
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  checkIn(@CurrentUser() u: any, @Body() dto: MeCheckInDto) {
    return this.meService.checkIn(u.userId, dto);
  }

  @Post('attendance/check-out')
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  checkOut(@CurrentUser() u: any, @Body() dto: MeCheckOutDto) {
    return this.meService.checkOut(u.userId, dto);
  }

  @Get('attendance/summary')
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  summary(
    @CurrentUser() u: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.meService.summary(u.userId, { from, to });
  }

  @Get('production')
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  production(
    @CurrentUser() u: any,
    @Query('dateKey') dateKey?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.meService.production(u.userId, {
      dateKey,
      from,
      to,
      limit: limit ? Number(limit) : 200,
    });
  }
}
