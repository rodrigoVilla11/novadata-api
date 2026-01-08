// src/preparations/preparations.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
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
  branchId: string; // ✅ obligatorio

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

type UpdatePreparationBody = Partial<Omit<CreatePreparationBody, 'branchId'>> & {
  // ⛔️ explícito: no permitimos cambiar branchId acá
  branchId?: never;
};

@Controller('preparations')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER')
export class PreparationsController {
  constructor(private readonly service: PreparationsService) {}

  /**
   * GET /preparations?branchId=...&onlyActive=true&supplierId=...&q=...
   */
  @Get()
  findAll(
    @Query('branchId') branchId?: string,
    @Query('onlyActive') onlyActive?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
  ) {
    return this.service.findAll({
      branchId: branchId || undefined,
      onlyActive: onlyActive === 'true' || onlyActive === '1',
      supplierId: supplierId !== undefined ? supplierId : undefined,
      q: q || undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * POST /preparations
   * body requires branchId
   */
  @Post()
  create(@Body() body: CreatePreparationBody) {
    return this.service.create(body as any);
  }

  /**
   * PATCH /preparations/:id
   * No permite cambiar branchId
   */
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePreparationBody) {
    return this.service.update(id, body as any);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.service.setActive(id, !!body?.isActive);
  }

  @Post(':id/recompute')
  recompute(@Param('id') id: string) {
    return this.service.recompute(id);
  }
}
