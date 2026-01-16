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

  /** Debug seguro: NO imprime cookies ni bearer completo */
  private debugReq(req: any, label: string, extra?: any) {
    const auth = String(req?.headers?.authorization || '');
    const authShort = auth
      ? `${auth.slice(0, 18)}...${auth.slice(-8)}`
      : '(none)';

    this.logger.debug(
      JSON.stringify(
        {
          label,
          method: req?.method,
          path: req?.originalUrl || req?.url,
          ip: req?.ip,
          ua: req?.headers?.['user-agent'],
          hasCookie: !!req?.headers?.cookie, // no mostramos cookie
          auth: authShort,
          user: req?.user ?? null,
          query: req?.query ?? null,
          params: req?.params ?? null,
          extra: extra ?? null,
        },
        null,
        2,
      ),
    );
  }

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
    // ✅ debug antes de todo
    this.debugReq(req, 'products.findAll', {
      rawQuery: { onlyActive, supplierId, categoryId, sellable, tag, q },
    });

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
    this.debugReq(req, 'products.findOne', { id });

    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    this.logger.debug(`[findOne] id=${id} branchId=${branchId}`);

    return this.service.findOne(id, branchId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Req() req: any, @Body() body: any) {
    this.debugReq(req, 'products.create', {
      bodyKeys: body ? Object.keys(body) : [],
      itemsLen: Array.isArray(body?.items) ? body.items.length : null,
    });

    const branchId = this.getBranchIdOrThrow(req);

    this.logger.debug(
      `[create] branchId=${branchId} name=${String(body?.name || '')}`,
    );

    return this.service.create(body, branchId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.debugReq(req, 'products.update', {
      id,
      bodyKeys: body ? Object.keys(body) : [],
      itemsLen: Array.isArray(body?.items) ? body.items.length : null,
    });

    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    this.logger.debug(
      `[update] id=${id} branchId=${branchId} name=${String(body?.name || '')}`,
    );

    return this.service.update(id, body, branchId);
  }

  @Patch(':id/active')
  @Roles('ADMIN', 'MANAGER')
  setActive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    this.debugReq(req, 'products.setActive', { id, body });

    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    this.logger.debug(
      `[setActive] id=${id} branchId=${branchId} isActive=${!!body?.isActive}`,
    );

    return this.service.setActive(id, !!body?.isActive, branchId);
  }

  @Post(':id/recompute')
  @Roles('ADMIN', 'MANAGER')
  recompute(@Req() req: any, @Param('id') id: string) {
    this.debugReq(req, 'products.recompute', { id });

    const branchId = this.getBranchIdOrThrow(req);
    assertObjectId(id, 'id');

    this.logger.debug(`[recompute] id=${id} branchId=${branchId}`);

    return this.service.recompute(id, branchId);
  }
}
