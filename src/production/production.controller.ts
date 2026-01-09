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
  UnauthorizedException,
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

function getUserId(req: any): string {
  const uid = req?.user?._id ?? req?.user?.id ?? req?.user?.sub ?? null;
  if (!uid) throw new UnauthorizedException('userId faltante');
  return String(uid);
}

function getBranchId(req: any): string {
  const bid = req?.user?.branchId ?? req?.user?.branch_id ?? null;
  if (!bid) throw new UnauthorizedException('branchId faltante en el token');
  return String(bid);
}

@Controller('production')
@UseGuards(AuthGuard('jwt'))
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateProductionDto) {
    const branchId = getBranchId(req);
    const userId = getUserId(req);
    return this.productionService.create(branchId, dto, userId);
  }

  @Get()
  list(
    @Req() req: any,
    @Query('dateKey') dateKey?: string,
    @Query('employeeId') employeeId?: string,
    @Query('taskId') taskId?: string,
    @Query('status') status?: ProductionStatus,
    @Query('isDone') isDone?: string, // "true" | "false"
    @Query('limit') limit?: string,
  ) {
    const branchId = getBranchId(req);

    return this.productionService.list(branchId, {
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
    const branchId = getBranchId(req);
    const userId = getUserId(req);
    return this.productionService.markDone(branchId, id, userId, Boolean(body.done));
  }

  @Post(':id/notes')
  addNote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AddNoteBodyDto,
  ) {
    const branchId = getBranchId(req);
    const userId = getUserId(req);
    return this.productionService.addNote(branchId, id, userId, body.text);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const branchId = getBranchId(req);
    return this.productionService.remove(branchId, id);
  }

  @Patch(':id/cancel')
  cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CancelBodyDto,
  ) {
    const branchId = getBranchId(req);
    const userId = getUserId(req);
    return this.productionService.setCanceled(branchId, id, userId, Boolean(body.canceled));
  }
}
