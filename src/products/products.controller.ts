import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Unit } from './enums/unit.enum';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  create(@Body() body: { name: string; unit: Unit; supplierId: string }) {
    return this.products.create(body);
  }

  @Get()
  findAll(@Query('supplierId') supplierId?: string) {
    return this.products.findAll({ supplierId });
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.products.setActive(id, body.isActive);
  }

  @Patch(':id/min')
  setMin(@Param('id') id: string, @Body() body: { minQty: number }) {
    return this.products.setMinQty(id, body.minQty);
  }
}
