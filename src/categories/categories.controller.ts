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
import { CategoriesService } from './categories.service';

@Controller('categories')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  private getBranchIdOrThrow(req: any) {
    const branchId = req?.user?.branchId;
    if (!branchId) throw new UnauthorizedException('Missing branchId in token');
    return String(branchId);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('onlyActive') onlyActive?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(req);

    return this.service.findAll({
      branchId,
      onlyActive: onlyActive === 'true',
      tag,
      q,
    });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.findOne(id, branchId);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.create(body, branchId);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const branchId = this.getBranchIdOrThrow(req);
    return this.service.update(id, body, branchId);
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
}
