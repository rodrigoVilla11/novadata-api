import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { Role } from '../users/schemas/user.schema';

type JwtPayload = {
  sub: string;
  email: string;
  roles: Role[];
  branchId: string | null;
  username?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
  ) {}

  private accessSecret() {
    return (
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'access_dev'
    );
  }

  private refreshSecret() {
    return process.env.JWT_REFRESH_SECRET || 'refresh_dev';
  }

  private signAccessToken(payload: JwtPayload) {
    return this.jwt.sign(payload, {
      secret: this.accessSecret(),
      expiresIn: '15m',
    });
  }

  private signRefreshToken(payload: JwtPayload) {
    return this.jwt.sign(payload, {
      secret: this.refreshSecret(),
      expiresIn: '7d',
    });
  }

  private buildJwtPayload(user: {
    id: string;
    email: string;
    roles: Role[];
    branchId: string | null;
    username?: string | null;
  }): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      roles: user.roles ?? [],
      branchId: user.branchId ?? null,
      username: user.username ?? null,
    };
  }

  /**
   * Register:
   * - Si querés permitir registro público, necesitás un branchId (porque USER no-superadmin requiere branch).
   * - Si NO querés registro público, lo mejor es eliminar register y que todo usuario lo cree ADMIN/SUPERADMIN.
   */
  async register(email: string, password: string, branchId: string) {
    if (!branchId) {
      throw new BadRequestException('branchId is required to register');
    }

    // Actor ficticio: en este modelo, registro público no es ideal.
    // Pero si lo mantenés, lo tratamos como “creado por SUPERADMIN del sistema”.
    // Alternativa recomendada: eliminar register público y crear users desde panel admin.
    const systemActor = {
      id: 'system',
      roles: ['SUPERADMIN'] as Role[],
      branchId: null,
    };

    const user = await this.users.create(systemActor, {
      email,
      password,
      roles: ['USER'],
      branchId,
      username: null,
    });

    return user;
  }

  async login(email: string, password: string, remember = false) {
    const user = await this.users.getUnsafeByEmail(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user?.isActive === false) {
      throw new UnauthorizedException('User is disabled');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const safeUser = {
      id: String(user._id),
      email: user.email,
      roles: user.roles ?? [],
      branchId: user.branchId ? String(user.branchId) : null,
      username: (user as any).username ?? null,
      isActive: user.isActive ?? true,
    };

    const payload = this.buildJwtPayload(safeUser);

    const accessToken = this.signAccessToken(payload);
    const refreshToken = this.signRefreshToken(payload);

    await this.users.setRefreshTokenHash(safeUser.id, refreshToken);

    return { accessToken, refreshToken, user: safeUser, remember };
  }

  async refresh(userId: string, refreshToken: string) {
    const validUser = await this.users.validateRefreshToken(
      userId,
      refreshToken,
    );
    if (!validUser) throw new UnauthorizedException('Invalid refresh token');

    const payload = {
      sub: validUser.id,
      email: validUser.email,
      roles: validUser.roles,
      branchId: validUser.branchId ?? null, // ✅
      username: validUser.username ?? null, // ✅
    };

    const accessToken = this.signAccessToken(payload);

    const newRefreshToken = this.signRefreshToken(payload);
    await this.users.setRefreshTokenHash(validUser.id, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken, user: validUser };
  }

  verifyRefreshToken(token: string) {
    try {
      return this.jwt.verify(token, {
        secret: this.refreshSecret(),
      }) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.users.clearRefreshToken(userId);
    return { ok: true };
  }
}
