import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

type ReqUser = {
  id?: string;
  userId?: string;
  email?: string;
  roles?: string[];
  branchId?: string | null;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = (req.user ?? {}) as ReqUser;

    const roles = (user.roles ?? []).map((r) => String(r).toUpperCase());
    const requiredUpper = required.map((r) => String(r).toUpperCase());

    const isSuper = roles.includes('SUPERADMIN');

    // ✅ Regla anti-token-viejo / anti-user-mal-creado:
    // Si NO es SUPERADMIN y el endpoint pide cualquier rol "de branch",
    // exigimos branchId.
    const requiresNonSuperRole = requiredUpper.some((r) => r !== 'SUPERADMIN');
    if (!isSuper && requiresNonSuperRole) {
      if (!user.branchId) {
        // Esto fuerza re-login si el token no trae branchId
        throw new UnauthorizedException('Invalid session (missing branchId)');
      }
    }

    return requiredUpper.some((r) => roles.includes(r));
  }
}
