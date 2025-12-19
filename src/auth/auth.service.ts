import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
  ) {}

  private signAccessToken(payload: any) {
    return this.jwt.sign(payload, {
      secret:
        process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'access_dev',
      expiresIn: '15m',
    });
  }

  private signRefreshToken(payload: any) {
    return this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'refresh_dev',
      expiresIn: '7d',
    });
  }

  async register(email: string, password: string) {
    const user = await this.users.create(email, password, ['USER']);
    return user; // register NO loguea automáticamente (podés cambiarlo si querés)
  }

  async login(email: string, password: string) {
    const user = await this.users.getUnsafeByEmail(email);
    if (user?.isActive === false) {
      throw new UnauthorizedException('User is disabled');
    }
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const safeUser = {
      id: String(user._id),
      email: user.email,
      roles: user.roles,
    };
    const payload = {
      sub: safeUser.id,
      email: safeUser.email,
      roles: safeUser.roles,
    };

    const accessToken = this.signAccessToken(payload);
    const refreshToken = this.signRefreshToken(payload);

    await this.users.setRefreshTokenHash(safeUser.id, refreshToken);

    return { accessToken, refreshToken, user: safeUser };
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
    };

    const accessToken = this.signAccessToken(payload);

    // (Opcional) Rotación: emitir refresh nuevo y reemplazar hash
    const newRefreshToken = this.signRefreshToken(payload);
    await this.users.setRefreshTokenHash(validUser.id, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken, user: validUser };
  }

  async logout(userId: string) {
    await this.users.clearRefreshToken(userId);
    return { ok: true };
  }
}
