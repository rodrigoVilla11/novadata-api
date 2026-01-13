// src/preparations/preparations.controller.ts
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
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';

import { PreparationsService } from './preparations.service';
import { Unit } from '../ingredients/enums/unit.enum';
import { PrepItemType } from './schemas/preparation.schema';

type PrepItemBody = {
  type: PrepItemType | 'INGREDIENT' | 'PREPARATION';
  ingredientId?: string | null;
  preparationId?: string | null;
  qty: number;
  note?: string | null;
};

type CreatePreparationBody = {
  // ❌ branchId ya NO viene en body
  name: string;
  description?: string | null;
  supplierId?: string | null;

  yieldQty: number;
  yieldUnit: Unit;

  wastePct?: number;
  extraCost?: number;
  currency?: 'ARS' | 'USD';

  items: PrepItemBody[];
};

type UpdatePreparationBody = Partial<CreatePreparationBody>;

@Controller('preparations')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER')
export class PreparationsController {
  constructor(private readonly service: PreparationsService) {}

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId;
    if (!branchId) throw new UnauthorizedException('Missing branchId in token');
    return String(branchId);
  }

  /**
   * GET /preparations?onlyActive=true&supplierId=...&q=...
   */
  @Get()
  findAll(
    @Req() req: any,
    @Query('onlyActive') onlyActive?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    return this.service.findAll({
      branchId,
      onlyActive: onlyActive === 'true' || onlyActive === '1',
      supplierId: supplierId !== undefined ? supplierId : undefined,
      q: q || undefined,
    });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.findOne(id, branchId);
  }

  /**
   * POST /preparations
   */
  @Post()
  create(@Req() req: any, @Body() body: CreatePreparationBody) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.create(body as any, branchId);
  }

  /**
   * PATCH /preparations/:id
   */
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdatePreparationBody) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.update(id, body as any, branchId);
  }

  @Patch(':id/active')
  setActive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.setActive(id, !!body?.isActive, branchId);
  }

  @Post(':id/recompute')
  recompute(@Req() req: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.recompute(id, branchId);
  }
}
