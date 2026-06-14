import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { DiscoveryService } from '../discovery/discovery.service';
import {
  parseCandidateScope,
  parseCandidateSort,
  parseCandidateStatus,
} from '../discovery/discovery.types';
import { AdminGuard } from './admin.guard';

function parseOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('me')
  getMe(@Req() request: FastifyRequest & AuthenticatedRequest) {
    return { login: request.session.login };
  }

  @Post('candidates/refresh')
  refreshCandidates(@Body() body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    return this.discoveryService.refreshCandidates({
      perRegion: parseOptionalPositiveInt(input.perRegion),
      perCountry: parseOptionalPositiveInt(input.perCountry),
    });
  }

  @Get('candidates')
  listCandidates(
    @Query('status') status?: string,
    @Query('region') region?: string,
    @Query('scope') scope?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.discoveryService.listCandidates({
      status: parseCandidateStatus(status),
      regionSlug: region || undefined,
      scope: parseCandidateScope(scope),
      sort: parseCandidateSort(sort),
      limit: parseOptionalPositiveInt(limit),
      offset: offset ? Math.max(0, Math.trunc(Number(offset)) || 0) : undefined,
    });
  }

  @Post('candidates/:login/promote')
  promote(
    @Param('login') login: string,
    @Req() request: FastifyRequest & AuthenticatedRequest,
  ) {
    return this.discoveryService.promote(login, request.session.login);
  }

  @Post('candidates/:login/reject')
  reject(@Param('login') login: string) {
    return this.discoveryService.reject(login);
  }

  @Post('candidates/:login/reset')
  reset(@Param('login') login: string) {
    return this.discoveryService.reset(login);
  }
}
