import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SetEmployeeActiveDto } from './dto/set-employee-active.dto';
import { LinkEmployeeUserDto } from './dto/link-employee-user.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('employees')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  // ADMIN: crea empleado
  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  // ADMIN y MANAGER: ver lista (ej: para producción)
  @Get()
  @Roles('ADMIN', 'MANAGER')
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.employeesService.findAll({ activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Patch(':id/active')
  @Roles('ADMIN')
  setActive(@Param('id') id: string, @Body() dto: SetEmployeeActiveDto) {
    return this.employeesService.setActive(id, dto.isActive);
  }

  @Patch(':id/user')
  @Roles('ADMIN')
  linkUser(@Param('id') id: string, @Body() dto: LinkEmployeeUserDto) {
    return this.employeesService.linkUser(id, dto.userId ?? null);
  }
}
