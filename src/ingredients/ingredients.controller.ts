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

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId;
    if (!branchId) throw new UnauthorizedException('Missing branchId in token');
    return String(branchId);
  }

  // ===========================================================================
  // CREATE
  // POST /ingredients
  // ===========================================================================
  @Post()
  async create(@Req() req: any, @Body() body: CreateIngredientBody) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.ingredientsService.create(body, branchId);
  }

  // ===========================================================================
  // LIST
  // GET /ingredients?supplierId=...&activeOnly=1&q=...&tag=...
  // ===========================================================================
  @Get()
  async findAll(
    @Req() req: any,
    @Query('supplierId') supplierId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    return this.ingredientsService.findAll({
      branchId,
      supplierId: supplierId || undefined,
      activeOnly: activeOnly === '1' || activeOnly === 'true',
      q: q || undefined,
      tag: tag || undefined,
    });
  }

  // ===========================================================================
  // FIND ONE
  // GET /ingredients/:id
  // ===========================================================================
  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.ingredientsService.findOne(id, branchId);
  }

  // ===========================================================================
  // SET ACTIVE
  // PATCH /ingredients/:id/active
  // body: { isActive: boolean }
  // ===========================================================================
  @Patch(':id/active')
  async setActive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.ingredientsService.setActive(id, Boolean(body?.isActive), branchId);
  }

  // ===========================================================================
  // SET MIN QTY
  // PATCH /ingredients/:id/min-qty
  // body: { minQty: number }
  // ===========================================================================
  @Patch(':id/min-qty')
  async setMinQty(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { minQty: number },
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.ingredientsService.setMinQty(id, Number(body?.minQty), branchId);
  }

  // ===========================================================================
  // SET NAME_FOR_SUPPLIER
  // PATCH /ingredients/:id/name-for-supplier
  // body: { name_for_supplier: string | null }
  // ===========================================================================
  @Patch(':id/name-for-supplier')
  async setNameForSupplier(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name_for_supplier: string | null },
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    return this.ingredientsService.setNameForSupplier(
      id,
      body?.name_for_supplier ?? null,
      branchId,
    );
  }

  // ===========================================================================
  // SET COST
  // PATCH /ingredients/:id/cost
  // body: { lastCost?: number; avgCost?: number; currency?: 'ARS' | 'USD' }
  // ===========================================================================
  @Patch(':id/cost')
  async setCost(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: { lastCost?: number; avgCost?: number; currency?: 'ARS' | 'USD' },
  ) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.ingredientsService.setCost(id, body || {}, branchId);
  }
}
