import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ApiService, parseDeveloperSort } from './api.service';
import { parseReposListQuery, parseReposViewportQuery } from './repos.dto';
import { parseUpdateProfileInput } from './update-profile.dto';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get('map')
  getMap() {
    return this.apiService.getMapData();
  }

  @Get('repos/list')
  getReposList(
    @Query('region') region?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    const input = parseReposListQuery({
      region,
      limit: limit != null ? String(limit) : undefined,
      cursor,
    });
    return this.apiService.getPromotedReposList(input);
  }

  @Get('repos/activity')
  async getRepoActivity(@Query('nameWithOwner') nameWithOwner?: string) {
    const trimmed = nameWithOwner?.trim() ?? '';
    if (!trimmed) {
      throw new BadRequestException(
        'Missing required query parameter: nameWithOwner',
      );
    }

    return this.apiService.getRepoActivity(trimmed);
  }

  @Get('repos/by-name')
  async getRepoByName(@Query('nameWithOwner') nameWithOwner?: string) {
    const trimmed = nameWithOwner?.trim() ?? '';
    if (!trimmed) {
      throw new BadRequestException(
        'Missing required query parameter: nameWithOwner',
      );
    }

    const repo = await this.apiService.getPromotedRepoByNameWithOwner(trimmed);

    if (!repo) {
      throw new NotFoundException(`Repo "${trimmed}" not found`);
    }

    return repo;
  }

  @Get('repos')
  getRepos(@Query('bbox') bbox?: string, @Query('limit') limit?: string) {
    const input = parseReposViewportQuery({ bbox, limit });
    if (!input) {
      return [];
    }
    return this.apiService.getPromotedReposInViewport(input);
  }

  @Get('stats')
  getStats() {
    return this.apiService.getStats();
  }

  @Get('developers')
  getCountryDevelopers(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor') cursor?: string,
    @Query('sort') sort?: string,
  ) {
    return this.apiService.getCountryDevelopers(
      limit ?? 10,
      cursor,
      parseDeveloperSort(sort),
    );
  }

  @Get('developers/:login/activity')
  async getDeveloperActivity(@Param('login') login: string) {
    return this.apiService.getDeveloperActivity(login);
  }

  @Get('developers/:login')
  async getDeveloper(@Param('login') login: string) {
    const developer = await this.apiService.getDeveloperByLogin(login);

    if (!developer) {
      throw new NotFoundException(`Developer "${login}" not found`);
    }

    return developer;
  }

  @Patch('developers/me')
  @UseGuards(AuthGuard)
  updateMyProfile(
    @Req() request: FastifyRequest & AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = parseUpdateProfileInput(body);
    return this.apiService.updateMyProfile(request.session.githubId, input);
  }

  @Get('locations/:slug/developers')
  async getLocationDevelopers(
    @Param('slug') slug: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor') cursor?: string,
    @Query('sort') sort?: string,
  ) {
    const result = await this.apiService.getLocationDevelopers(
      slug,
      limit ?? 10,
      cursor,
      parseDeveloperSort(sort),
    );

    if (!result) {
      throw new NotFoundException(`Location "${slug}" not found`);
    }

    return result;
  }
}
