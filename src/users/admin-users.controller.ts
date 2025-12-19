import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from './schemas/user.schema';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private users: UsersService) {}

  @Get()
  list() {
    return this.users.listUsers();
  }

  @Post()
  createUser(
    @Body() body: { email: string; password: string; roles?: Role[] },
  ) {
    return this.users.adminCreateUser(
      body.email,
      body.password,
      body.roles ?? ['USER'],
    );
  }

  @Patch(':id/roles')
  setRoles(@Param('id') id: string, @Body() body: { roles: Role[] }) {
    return this.users.updateRoles(id, body.roles);
  }
  @Patch(':id/password')
  setPassword(@Param('id') id: string, @Body() body: { password: string }) {
    return this.users.setPassword(id, body.password);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.users.setActive(id, body.isActive);
  }
}
