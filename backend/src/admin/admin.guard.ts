import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AdminService } from './admin.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Partial<AuthenticatedRequest>>();
    const token = this.authService.extractSessionToken(
      request.headers.authorization,
      request.cookies,
    );
    const session = await this.authService.getSessionFromToken(token);

    if (!session) {
      throw new UnauthorizedException('Not authenticated');
    }

    const isAdmin = await this.adminService.isAdmin(session);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    request.session = session;
    return true;
  }
}
