import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('github')
  startGitHubOAuth(@Res() reply: FastifyReply) {
    const state = this.authService.createOAuthState();
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    reply.setCookie(this.authService.oauthStateCookieName, state, {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      path: '/',
      maxAge: 10 * 60,
    });

    return reply.redirect(this.authService.getGitHubAuthorizeUrl(state), 302);
  }

  @Get('github/callback')
  async handleGitHubCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Missing OAuth parameters');
    }

    const storedState =
      request.cookies?.[this.authService.oauthStateCookieName];
    const { token, redirectUrl } =
      await this.authService.exchangeCodeForSession(code, state, storedState);

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    reply.clearCookie(this.authService.oauthStateCookieName, { path: '/' });
    reply.setCookie(this.authService.sessionCookieName, token, {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.redirect(redirectUrl, 302);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Req() request: FastifyRequest & AuthenticatedRequest) {
    return this.authService.getMe(request.session);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.clearCookie(this.authService.sessionCookieName, { path: '/' });
    return { ok: true };
  }
}
