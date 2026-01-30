import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { Roles } from 'src/auth/roles.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

import { CombosService } from './combos.service';

function assertObjectId(id?: string, label?: string) {
  if (!id) return;
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`${label || 'id'} inválido`);
  }
}

@Controller('combos')
@UseGuards(JwtAuthGuard)
export class CombosController {
  private readonly logger = new Logger(CombosController.name);

  constructor(private readonly service: CombosService) {}

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId;

    if (!branchId) {
      this.logger.warn(
        `[getBranchIdOrThrow] Missing branchId. user=${JSON.stringify(
          req?.user ?? null,
        )}`,
      );
      throw new UnauthorizedException('Missing branchId in token');
    }

    return String(branchId);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findAll(
    @Req() req: any,
    @Query('onlyActive') onlyActive?: string,
    @Query('activeNow') activeNow?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    const parsed = {
      branchId,
      onlyActive: onlyActive == null ? undefined : onlyActive === 'true',
      activeNow: activeNow == null ? undefined : activeNow === 'true',
      tag,
      q,
    };

    return this.service.findAll(parsed);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findOne(@Req() req: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    return this.service.findOne(id, branchId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Req() req: any, @Body() body: any) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.create(body, branchId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    return this.service.update(id, body, branchId);
  }

  @Patch(':id/active')
  @Roles('ADMIN', 'MANAGER')
  setActive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    return this.service.setActive(id, !!body?.isActive, branchId);
  }

  @Post(':id/recompute')
  @Roles('ADMIN', 'MANAGER')
  recompute(@Req() req: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    return this.service.recompute(id, branchId);
  }
}
