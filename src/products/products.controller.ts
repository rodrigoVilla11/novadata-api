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

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId;
    if (!branchId) throw new UnauthorizedException('Missing branchId in token');
    return String(branchId);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  findAll(
    @Req() req: any,
    @Query('onlyActive') onlyActive?: string,
    @Query('supplierId') supplierId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sellable') sellable?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    assertObjectId(supplierId, 'supplierId');
    assertObjectId(categoryId, 'categoryId');

    return this.service.findAll({
      branchId,
      onlyActive: onlyActive == null ? undefined : onlyActive === 'true',
      supplierId,
      categoryId,
      sellable: sellable == null ? undefined : sellable === 'true',
      tag,
      q,
    });
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
