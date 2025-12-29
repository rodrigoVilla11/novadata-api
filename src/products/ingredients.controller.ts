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

import { IngredientsService } from './ingredients.service';
import { Unit } from './enums/unit.enum';

type CreateIngredientBody = {
  name: string;
  baseUnit: Unit;
  supplierId: string;

  name_for_supplier?: string | null;

  minQty?: number;
  trackStock?: boolean;

  lastCost?: number;
  avgCost?: number;
  currency?: 'ARS' | 'USD';

  tags?: string[];
  notes?: string | null;

  isFood?: boolean;
};

@Controller('ingredients')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER')
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  // ===========================================================================
  // CREATE
  // POST /ingredients
  // ===========================================================================
  @Post()
  async create(@Body() body: CreateIngredientBody) {
    return this.ingredientsService.create(body);
  }

  // ===========================================================================
  // LIST
  // GET /ingredients?supplierId=...&activeOnly=1
  // ===========================================================================
  @Get()
  async findAll(
    @Query('supplierId') supplierId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.ingredientsService.findAll({
      supplierId: supplierId || undefined,
      activeOnly: activeOnly === '1' || activeOnly === 'true',
    });
  }

  // ===========================================================================
  // SET ACTIVE
  // PATCH /ingredients/:id/active
  // body: { isActive: boolean }
  // ===========================================================================
  @Patch(':id/active')
  async setActive(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.ingredientsService.setActive(id, Boolean(body?.isActive));
  }

  // ===========================================================================
  // SET MIN QTY
  // PATCH /ingredients/:id/min-qty
  // body: { minQty: number }
  // ===========================================================================
  @Patch(':id/min-qty')
  async setMinQty(
    @Param('id') id: string,
    @Body() body: { minQty: number },
  ) {
    return this.ingredientsService.setMinQty(id, Number(body?.minQty));
  }

  // ===========================================================================
  // SET NAME_FOR_SUPPLIER
  // PATCH /ingredients/:id/name-for-supplier
  // body: { name_for_supplier: string | null }
  // ===========================================================================
  @Patch(':id/name-for-supplier')
  async setNameForSupplier(
    @Param('id') id: string,
    @Body() body: { name_for_supplier: string | null },
  ) {
    return this.ingredientsService.setNameForSupplier(
      id,
      body?.name_for_supplier ?? null,
    );
  }

  // ===========================================================================
  // SET COST
  // PATCH /ingredients/:id/cost
  // body: { lastCost?: number; avgCost?: number; currency?: 'ARS' | 'USD' }
  // ===========================================================================
  @Patch(':id/cost')
  async setCost(
    @Param('id') id: string,
    @Body()
    body: { lastCost?: number; avgCost?: number; currency?: 'ARS' | 'USD' },
  ) {
    return this.ingredientsService.setCost(id, body || {});
  }
}
