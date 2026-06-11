import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Partial<AuthenticatedRequest>>();
    const token = request.cookies?.[this.authService.sessionCookieName];
    const session = await this.authService.getSessionFromToken(token);

    if (!session) {
      throw new UnauthorizedException('Not authenticated');
    }

    request.session = session;
    return true;
  }
}
