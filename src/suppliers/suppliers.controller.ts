import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SupplierWorkMode, Weekday } from './schemas/supplier.schema';

type AuthedReq = {
  user?: {
    branchId: string | null;
    _id?: string;
    id?: string;
    sub?: string;
    roles?: string[];
  };
};

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Req() req: AuthedReq,
    @Body()
    body: {
      name: string;

      contactName?: string | null;
      phone?: string | null;
      email?: string | null;

      taxId?: string | null;
      address?: string | null;

      workMode?: SupplierWorkMode;
      paymentDays?: number | null;

      orderDays?: Weekday[];
      leadTimeDays?: number | null;
      cutoffTime?: string | null;

      notes?: string | null;
    },
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new Error('Branch ID is required');
    return this.suppliers.create(branchId, body);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER')
  findAll(@Req() req: AuthedReq, @Query('activeOnly') activeOnly?: string) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new Error('Branch ID is required');
    return this.suppliers.findAll(branchId, {
      activeOnly: activeOnly === '1' || activeOnly === 'true',
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  findOne(@Req() req: AuthedReq, @Param('id') id: string) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new Error('Branch ID is required');
    return this.suppliers.findOne(branchId, id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Req() req: AuthedReq,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;

      isActive?: boolean;

      contactName?: string | null;
      phone?: string | null;
      email?: string | null;

      taxId?: string | null;
      address?: string | null;

      workMode?: SupplierWorkMode;
      paymentDays?: number | null;

      orderDays?: Weekday[];
      leadTimeDays?: number | null;
      cutoffTime?: string | null;

      notes?: string | null;
    },
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new Error('Branch ID is required');
    return this.suppliers.update(branchId, id, body);
  }

  @Patch(':id/active')
  @Roles('ADMIN')
  setActive(
    @Req() req: AuthedReq,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    const branchId = req.user?.branchId;
    if (!branchId) throw new Error('Branch ID is required');
    return this.suppliers.setActive(branchId, id, body.isActive);
  }
}
