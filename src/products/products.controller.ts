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
import { Roles } from 'src/auth/roles.decorator';
import { ProductsService } from './products.service';
import { Types } from 'mongoose';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

function assertObjectId(id?: string, label?: string) {
  if (!id) return;
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`${label || 'id'} inválido`);
  }
}

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly service: ProductsService) {}

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId;

    // log útil SIEMPRE si falta branch
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
    @Query('supplierId') supplierId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sellable') sellable?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {


    const branchId = this.getBranchIdOrThrow(req);

    assertObjectId(supplierId, 'supplierId');
    assertObjectId(categoryId, 'categoryId');

    const parsed = {
      branchId,
      onlyActive: onlyActive == null ? undefined : onlyActive === 'true',
      supplierId,
      categoryId,
      sellable: sellable == null ? undefined : sellable === 'true',
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
