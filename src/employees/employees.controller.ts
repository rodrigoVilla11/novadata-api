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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SetEmployeeActiveDto } from './dto/set-employee-active.dto';
import { LinkEmployeeUserDto } from './dto/link-employee-user.dto';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '../users/schemas/user.schema';

type ReqUser = {
  id: string;
  roles: Role[];
  branchId: string | null;
};

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  private actor(req: any): ReqUser {
    return {
      id: req.user?.id ?? req.user?.userId,
      roles: req.user?.roles ?? [],
      branchId: req.user?.branchId ?? null,
    };
  }

  /**
   * ADMIN: crea empleado en SU branch
   * SUPERADMIN: opcional (si querés habilitar) con query branchId
   */
  @Post()
  @Roles('ADMIN', 'SUPERADMIN')
  create(
    @Req() req: any,
    @Body() dto: CreateEmployeeDto,
    @Query('branchId') branchId?: string,
  ) {
    const actor = this.actor(req);

    // Si es SUPERADMIN y quiere crear, necesita branchId por query.
    // (Si no querés permitir SUPERADMIN acá, sacalo de @Roles)
    if (actor.roles.includes('SUPERADMIN')) {
      if (!branchId) {
        // el service ya lanza error, pero acá lo dejamos más claro
        // y además podrías redirigirlo a otro endpoint si quisieras.
      } else {
        // Trick: convertimos temporalmente el actor para forzar branch scoping en create
        // sin cambiar el DTO.
        actor.branchId = branchId;
        actor.roles = ['ADMIN' as any]; // solo para usar create normal
      }
    }

    return this.employeesService.create(actor as any, dto);
  }

  /**
   * ADMIN/MANAGER: lista su branch
   * SUPERADMIN: lista todo o filtra por branchId
   */
  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPERADMIN')
  findAll(
    @Req() req: any,
    @Query('activeOnly') activeOnly?: string,
    @Query('branchId') branchId?: string,
  ) {
    const actor = this.actor(req);
    return this.employeesService.findAll(actor as any, {
      activeOnly: activeOnly === 'true',
      branchId: branchId ?? null,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPERADMIN')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.employeesService.findOne(this.actor(req) as any, id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERADMIN')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(this.actor(req) as any, id, dto);
  }

  @Patch(':id/active')
  @Roles('ADMIN', 'SUPERADMIN')
  setActive(@Req() req: any, @Param('id') id: string, @Body() dto: SetEmployeeActiveDto) {
    return this.employeesService.setActive(this.actor(req) as any, id, dto.isActive);
  }

  @Patch(':id/user')
  @Roles('ADMIN', 'SUPERADMIN')
  linkUser(@Req() req: any, @Param('id') id: string, @Body() dto: LinkEmployeeUserDto) {
    return this.employeesService.linkUser(this.actor(req) as any, id, dto.userId ?? null);
  }
}
