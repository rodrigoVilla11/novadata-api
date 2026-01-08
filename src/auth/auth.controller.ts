import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private setRefreshCookie(res: Response, token: string) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE as any) || 'lax';
    const domain = process.env.COOKIE_DOMAIN || undefined;

    /**
     * Reglas:
     * - Si usás frontend y backend en dominios distintos => sameSite:'none' y secure:true (HTTPS)
     * - Si es mismo dominio => sameSite:'lax' suele ser lo mejor
     */
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure, // ✅ usar variable (no hardcode)
      sameSite, // 'lax' | 'strict' | 'none'
      domain,
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response) {
    const domain = process.env.COOKIE_DOMAIN || undefined;
    res.clearCookie('refresh_token', { path: '/auth/refresh', domain });
  }

  /**
   * ✅ Recomendado: NO exponer register público.
   * Si lo querés mantener, tenés que pedir branchId, porque USER no-superadmin requiere branch.
   */
  @Post('register')
  async register(@Body() body: { email: string; password: string; branchId?: string }) {
    if (!body.branchId) {
      throw new BadRequestException('branchId is required to register');
    }
    return this.auth.register(body.email, body.password, body.branchId);
  }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.login(
      body.email,
      body.password,
    );

    this.setRefreshCookie(res, refreshToken);

    return { access_token: accessToken, user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('Missing refresh token');

    const decoded = this.auth.verifyRefreshToken(token);
    const userId = decoded?.sub;
    if (!userId) throw new UnauthorizedException('Invalid refresh token');

    const { accessToken, refreshToken, user } = await this.auth.refresh(
      userId,
      token,
    );

    this.setRefreshCookie(res, refreshToken);

    return { access_token: accessToken, user };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token;

    // "best effort": si el token está mal/expirado igual limpiamos cookie
    if (token) {
      try {
        const decoded = this.auth.verifyRefreshToken(token);
        const userId = decoded?.sub;
        if (userId) await this.auth.logout(userId);
      } catch {
        // ignore
      }
    }

    this.clearRefreshCookie(res);
    return { ok: true };
  }
}
