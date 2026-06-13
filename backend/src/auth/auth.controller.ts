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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('github')
  startGitHubOAuth(@Res() reply: FastifyReply) {
    const state = this.authService.createOAuthState();
    reply.setCookie(this.authService.oauthStateCookieName, state, {
      ...this.authService.getSessionCookieOptions(),
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
    const { token } = await this.authService.exchangeCodeForSession(
      code,
      state,
      storedState,
    );

    const sessionCookieOptions = this.authService.getSessionCookieOptions();

    reply.clearCookie(
      this.authService.oauthStateCookieName,
      sessionCookieOptions,
    );

    return reply.redirect(
      this.authService.buildAuthenticatedRedirectUrl(token),
      302,
    );
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Req() request: FastifyRequest & AuthenticatedRequest) {
    return this.authService.getMe(request.session);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.clearCookie(
      this.authService.sessionCookieName,
      this.authService.getSessionCookieOptions(),
    );
    return { ok: true };
  }

  @Post('opt-out')
  @UseGuards(AuthGuard)
  async optOut(@Req() request: FastifyRequest & AuthenticatedRequest) {
    return this.authService.optOut(request.session);
  }
}
