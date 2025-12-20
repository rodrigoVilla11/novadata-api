import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WeeklySyncService } from './weekly-sync.service';
import { CreateWeeklyMessageDto } from './dto/create-weekly-message.dto';
import { CloseWeekDto } from './dto/close-week.dto';
import { Roles } from 'src/auth/roles.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('weekly-sync')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN', 'MANAGER')
export class WeeklySyncController {
  constructor(private readonly weeklySyncService: WeeklySyncService) {}

  @Get('current')
  async getCurrent(@Req() req: any) {
    return this.weeklySyncService.getOrCreateCurrentWeek(req.user);
  }

  @Get('weeks')
  async listWeeks(@Req() req: any, @Query('limit') limit?: string) {
    return this.weeklySyncService.listWeeks(
      req.user,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':threadId/messages')
  async listMessages(
    @Req() req: any,
    @Param('threadId') threadId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.weeklySyncService.listMessages(req.user, threadId, {
      limit: limit ? Number(limit) : 50,
      cursor,
    });
  }

  @Post(':threadId/messages')
  async createMessage(
    @Req() req: any,
    @Param('threadId') threadId: string,
    @Body() dto: CreateWeeklyMessageDto,
  ) {
    return this.weeklySyncService.createMessage(req.user, threadId, dto);
  }

  @Post(':threadId/close')
  async closeWeek(
    @Req() req: any,
    @Param('threadId') threadId: string,
    @Body() dto: CloseWeekDto,
  ) {
    return this.weeklySyncService.closeWeek(req.user, threadId, dto);
  }
}
