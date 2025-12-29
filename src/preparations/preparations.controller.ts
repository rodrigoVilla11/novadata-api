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

@Controller('preparations')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER')
export class PreparationsController {
  constructor(private readonly service: PreparationsService) {}

  @Get()
  findAll(@Query('onlyActive') onlyActive?: string) {
    return this.service.findAll({ onlyActive: onlyActive === 'true' });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string | null;
      supplierId?: string | null;

      yieldQty: number;
      yieldUnit: Unit;

      wastePct?: number;
      extraCost?: number;
      currency?: 'ARS' | 'USD';

      items: Array<{
        type: PrepItemType | 'INGREDIENT' | 'PREPARATION';
        ingredientId?: string | null;
        preparationId?: string | null;
        qty: number;
        note?: string | null;
      }>;
    },
  ) {
    return this.service.create(body as any);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Patch(':id/active')
  setActive(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.service.setActive(id, !!body?.isActive);
  }

  @Post(':id/recompute')
  recompute(@Param('id') id: string) {
    return this.service.recompute(id);
  }
}
