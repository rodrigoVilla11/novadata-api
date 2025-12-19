import { Body, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private setRefreshCookie(res: Response, token: string) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure,              // true en https
      sameSite: 'lax',     // en prod podrías usar 'none' con secure:true si cross-site
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie('refresh_token', { path: '/auth/refresh' });
  }

  @Post('register')
  register(@Body() body: { email: string; password: string }) {
    return this.auth.register(body.email, body.password);
  }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.login(body.email, body.password);
    this.setRefreshCookie(res, refreshToken);
    return { access_token: accessToken, user };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('Missing refresh token');

    // decodificar para sacar sub (sin confiar al 100%, igual validamos con bcrypt hash en DB)
    const decoded: any = this.auth['jwt'].decode(token);
    const userId = decoded?.sub;
    if (!userId) throw new UnauthorizedException('Invalid refresh token');

    const { accessToken, refreshToken, user } = await this.auth.refresh(userId, token);
    this.setRefreshCookie(res, refreshToken);
    return { access_token: accessToken, user };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token;
    if (token) {
      const decoded: any = this.auth['jwt'].decode(token);
      const userId = decoded?.sub;
      if (userId) await this.auth.logout(userId);
    }
    this.clearRefreshCookie(res);
    return { ok: true };
  }
}
