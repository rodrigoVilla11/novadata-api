import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Roles } from 'src/auth/roles.decorator';

import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { UpdateMyBranchDto } from './dto/update-my-branch.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles('SUPERADMIN')
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get()
  @Roles('SUPERADMIN')
  findAll(@Query('includeDeleted') includeDeleted?: string) {
    return this.branchesService.findAll({
      includeDeleted: includeDeleted === 'true',
    });
  }
  @Get('me')
  @Roles('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  async findMyBranch(@Req() req: any) {
    const branchId = req?.user?.branchId;
    if (!branchId) throw new ForbiddenException('User has no branchId');
    return this.branchesService.findOne(String(branchId));
  }

  @Patch('me')
  @Roles('SUPERADMIN', 'ADMIN', 'MANAGER')
  async updateMyBranch(@Req() req: any, @Body() dto: UpdateMyBranchDto) {
    const branchId = req?.user?.branchId;
    if (!branchId) throw new ForbiddenException('User has no branchId');
    return this.branchesService.update(String(branchId), dto);
  }

  @Get(':id')
  @Roles('SUPERADMIN')
  findOne(@Param('id') id: string) {
    return this.branchesService.findOne(id);
  }

  // 🔒 Mantener endpoint existente, pero con chequeo extra para ADMIN
  @Patch(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const roles: string[] = req?.user?.roles ?? [];
    const isSuper = roles.includes('SUPERADMIN');

    if (!isSuper) {
      const myBranchId = String(req?.user?.branchId ?? '');
      if (!myBranchId || myBranchId !== String(id)) {
        throw new ForbiddenException('Only can edit your own branch');
      }
    }

    return this.branchesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  remove(@Param('id') id: string) {
    return this.branchesService.remove(id);
  }

  @Patch(':id/restore')
  @Roles('SUPERADMIN')
  restore(@Param('id') id: string) {
    return this.branchesService.restore(id);
  }
}
