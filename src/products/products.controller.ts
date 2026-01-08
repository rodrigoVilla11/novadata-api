import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { ProductsService } from './products.service';
import { Types } from 'mongoose';

function assertObjectId(id?: string, label?: string) {
  if (!id) return;
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`${label || 'id'} inválido`);
  }
}

@Controller('products')
@UseGuards(AuthGuard('jwt'))
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findAll(
    @Query('onlyActive') onlyActive?: string,
    @Query('branchId') branchId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sellable') sellable?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {
    assertObjectId(branchId, 'branchId');
    assertObjectId(supplierId, 'supplierId');
    assertObjectId(categoryId, 'categoryId');

    return this.service.findAll({
      onlyActive: onlyActive == null ? undefined : onlyActive === 'true',
      branchId,
      supplierId,
      categoryId,
      sellable: sellable == null ? undefined : sellable === 'true',
      tag,
      q,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findOne(@Param('id') id: string) {
    assertObjectId(id, 'id');
    return this.service.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() body: any) {
    assertObjectId(id, 'id');
    return this.service.update(id, body);
  }

  @Patch(':id/active')
  @Roles('ADMIN', 'MANAGER')
  setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    assertObjectId(id, 'id');
    return this.service.setActive(id, !!body?.isActive);
  }

  @Post(':id/recompute')
  @Roles('ADMIN', 'MANAGER')
  recompute(@Param('id') id: string) {
    assertObjectId(id, 'id');
    return this.service.recompute(id);
  }
}
