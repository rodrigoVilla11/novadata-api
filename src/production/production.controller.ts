import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { ProductionService } from './production.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { ProductionStatus } from './schemas/production.schema';

class MarkDoneBodyDto {
  done!: boolean;
}

class AddNoteBodyDto {
  text!: string;
}

class CancelBodyDto {
  canceled!: boolean;
}

@Controller('production')
@UseGuards(AuthGuard('jwt'))
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateProductionDto) {
    return this.productionService.create(
      dto,
      String(req.user?._id ?? req.user?.id),
    );
  }

  @Get()
  list(
    @Query('dateKey') dateKey?: string,
    @Query('employeeId') employeeId?: string,
    @Query('taskId') taskId?: string,
    @Query('status') status?: ProductionStatus,
    @Query('isDone') isDone?: string, // "true" | "false"
    @Query('limit') limit?: string,
  ) {
    return this.productionService.list({
      dateKey,
      employeeId,
      taskId,
      status,
      isDone,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch(':id/done')
  markDone(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: MarkDoneBodyDto,
  ) {
    const userId = String(req.user?._id ?? req.user?.id);
    return this.productionService.markDone(id, userId, Boolean(body.done));
  }

  @Post(':id/notes')
  addNote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AddNoteBodyDto,
  ) {
    const userId = String(req.user?._id ?? req.user?.id);
    return this.productionService.addNote(id, userId, body.text);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productionService.remove(id);
  }

  @Patch(':id/cancel')
  cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CancelBodyDto,
  ) {
    const userId = String(req.user?._id ?? req.user?.id);
    return this.productionService.setCanceled(
      id,
      userId,
      Boolean(body.canceled),
    );
  }
}
