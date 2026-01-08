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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { Role } from './schemas/user.schema';
import { Roles } from 'src/auth/roles.decorator';

type Actor = {
  id: string;
  roles: Role[];
  branchId: string | null;
};

type CreateUserDto = {
  email: string;
  password: string;
  roles?: Role[];
  branchId?: string | null;
  username?: string | null;
};

type UpdateRolesDto = { roles: Role[] };
type SetBranchDto = { branchId: string | null };
type SetUsernameDto = { username: string | null };
type SetPasswordDto = { newPassword: string };
type SetActiveDto = { isActive: boolean };

function actorFromReq(req: any): Actor {
  const u = req?.user || {};
  return {
    id: String(u.id ?? u._id ?? u.sub ?? ''),
    roles: (u.roles ?? []) as Role[],
    branchId: u.branchId ? String(u.branchId) : null,
  };
}

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@Req() req: any) {
    return { user: req.user };
  }
  // -------------------------------------------------
  // Create user
  // SUPERADMIN: puede crear ADMIN y users en cualquier branch
  // ADMIN: crea users solo en su branch (branchId se ignora)
  // -------------------------------------------------
  @Post()
  @Roles('SUPERADMIN', 'ADMIN')
  create(@Req() req: any, @Body() body: CreateUserDto) {
    return this.usersService.create(actorFromReq(req), body);
  }

  // -------------------------------------------------
  // List users
  // SUPERADMIN: puede filtrar por branchId (query)
  // ADMIN: solo su branch (ignora query.branchId)
  // -------------------------------------------------
  @Get()
  @Roles('SUPERADMIN', 'ADMIN')
  list(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('role') role?: Role,
  ) {
    return this.usersService.listUsers(actorFromReq(req), {
      branchId,
      role,
    });
  }

  // -------------------------------------------------
  // Get one
  // (si querés scoping por branch acá también, lo hacemos en service)
  // -------------------------------------------------
  @Get(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  getById(@Req() req: any, @Param('id') id: string) {
    // Si querés, podés usar un getByIdScoped(actor,id)
    return this.usersService.getById(id);
  }

  // -------------------------------------------------
  // Update roles
  // SOLO SUPERADMIN puede asignar ADMIN/SUPERADMIN (validado en service)
  // ADMIN solo puede cambiar roles dentro de su branch (validado en service)
  // -------------------------------------------------
  @Patch(':id/roles')
  @Roles('SUPERADMIN', 'ADMIN')
  updateRoles(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateRolesDto,
  ) {
    return this.usersService.updateRoles(actorFromReq(req), id, body.roles);
  }

  // -------------------------------------------------
  // Set branch (solo SUPERADMIN)
  // -------------------------------------------------
  @Patch(':id/branch')
  @Roles('SUPERADMIN')
  setBranch(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SetBranchDto,
  ) {
    return this.usersService.setBranch(actorFromReq(req), id, body.branchId);
  }

  // -------------------------------------------------
  // Set username
  // (ADMIN solo su branch, validado en service)
  // -------------------------------------------------
  @Patch(':id/username')
  @Roles('SUPERADMIN', 'ADMIN')
  setUsername(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SetUsernameDto,
  ) {
    return this.usersService.setUsername(actorFromReq(req), id, body.username);
  }

  // -------------------------------------------------
  // Set password
  // (ADMIN solo su branch, validado en service)
  // -------------------------------------------------
  @Patch(':id/password')
  @Roles('SUPERADMIN', 'ADMIN')
  setPassword(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SetPasswordDto,
  ) {
    return this.usersService.setPassword(
      actorFromReq(req),
      id,
      body.newPassword,
    );
  }

  // -------------------------------------------------
  // Activate / deactivate
  // (ADMIN solo su branch, validado en service)
  // -------------------------------------------------
  @Patch(':id/active')
  @Roles('SUPERADMIN', 'ADMIN')
  setActive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SetActiveDto,
  ) {
    return this.usersService.setActive(actorFromReq(req), id, body.isActive);
  }
}
