import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { WeeklySyncService } from './weekly-sync.service';
import { CreateWeeklyMessageDto } from './dto/create-weekly-message.dto';
import { CloseWeekDto } from './dto/close-week.dto';
import { Roles } from 'src/auth/roles.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

function parseLimit(v: any, fallback: number, min = 1, max = 200) {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequestException('limit inválido');
  return Math.min(Math.max(Math.trunc(n), min), max);
}

@Controller('weekly-sync')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN', 'MANAGER')
export class WeeklySyncController {
  constructor(private readonly weeklySyncService: WeeklySyncService) {}

  @Get('current')
  async getCurrent(@Req() req: any) {
    return this.weeklySyncService.getOrCreateCurrentWeek(req.user);
  }

  /**
   * Útil para el front: trae thread actual + mensajes (paginado)
   * GET /weekly-sync/current-with-messages?limit=50
   */
  @Get('current-with-messages')
  async getCurrentWithMessages(@Req() req: any, @Query('limit') limit?: string) {
    const thread = await this.weeklySyncService.getOrCreateCurrentWeek(req.user);
    if (!thread) {
      throw new BadRequestException('Could not create or retrieve current week');
    }
    const messages = await this.weeklySyncService.listMessages(req.user, thread.id, {
      limit: parseLimit(limit, 50, 1, 200),
      cursor: undefined,
    });

    return { thread, ...messages };
  }

  @Get('weeks')
  async listWeeks(@Req() req: any, @Query('limit') limit?: string) {
    return this.weeklySyncService.listWeeks(req.user, parseLimit(limit, 20, 1, 100));
  }

  @Get(':threadId/messages')
  async listMessages(
    @Req() req: any,
    @Param('threadId') threadId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.weeklySyncService.listMessages(req.user, threadId, {
      limit: parseLimit(limit, 50, 1, 200),
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
