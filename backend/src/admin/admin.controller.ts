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

function parseOptionalInt(value: unknown, min: number): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    return undefined;
  }
  return parsed;
}

function parseOptionalPositiveInt(value: unknown): number | undefined {
  return parseOptionalInt(value, 1);
}

function parseOptionalNonNegativeInt(value: unknown): number | undefined {
  return parseOptionalInt(value, 0);
}

@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('me')
  getMe(@Req() request: FastifyRequest & AuthenticatedRequest) {
    return { login: request.session.login };
  }

  @Post('repo-candidates/refresh')
  refreshCandidates(@Body() body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    return this.discoveryService.refreshCandidates({
      perRegion: parseOptionalPositiveInt(input.perRegion),
      perCountry: parseOptionalPositiveInt(input.perCountry),
      topDevs: parseOptionalPositiveInt(input.topDevs),
      reposPerDev: parseOptionalPositiveInt(input.reposPerDev),
    });
  }

  @Get('repo-candidates')
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
      offset: parseOptionalNonNegativeInt(offset),
    });
  }

  @Post('repo-candidates/:repoId/promote')
  promote(
    @Param('repoId') repoId: string,
    @Req() request: FastifyRequest & AuthenticatedRequest,
  ) {
    return this.discoveryService.promote(repoId, request.session.login);
  }

  @Post('repo-candidates/:repoId/reject')
  reject(@Param('repoId') repoId: string) {
    return this.discoveryService.reject(repoId);
  }

  @Post('repo-candidates/:repoId/reset')
  reset(@Param('repoId') repoId: string) {
    return this.discoveryService.reset(repoId);
  }
}
