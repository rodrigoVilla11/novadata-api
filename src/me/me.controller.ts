import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from 'src/auth/roles.decorator';
import { MeService } from './me.service';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IsOptional, IsString, Matches } from 'class-validator';

class MeCheckInDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateKey inválido (YYYY-MM-DD)' })
  dateKey!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

class MeCheckOutDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateKey inválido (YYYY-MM-DD)' })
  dateKey!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  me(@CurrentUser() u: any) {
    return this.meService.me(String(u?.userId ?? u?.id ?? u?._id));
  }

  @Post('attendance/check-in')
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  checkIn(@CurrentUser() u: any, @Body() dto: MeCheckInDto) {
    return this.meService.checkIn(String(u?.userId ?? u?.id ?? u?._id), dto);
  }

  @Post('attendance/check-out')
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  checkOut(@CurrentUser() u: any, @Body() dto: MeCheckOutDto) {
    return this.meService.checkOut(String(u?.userId ?? u?.id ?? u?._id), dto);
  }

  @Get('attendance/summary')
  @Roles('ADMIN', 'MANAGER', 'USER', 'CASHIER')
  summary(
    @CurrentUser() u: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.meService.summary(String(u?.userId ?? u?.id ?? u?._id), {
      from,
      to,
    });
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
    return this.meService.production(String(u?.userId ?? u?.id ?? u?._id), {
      dateKey,
      from,
      to,
      limit: limit ? Number(limit) : 200,
    });
  }
}
