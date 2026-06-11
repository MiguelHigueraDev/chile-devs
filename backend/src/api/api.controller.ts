import {
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
import { parseUpdateProfileInput } from './update-profile.dto';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get('map')
  getMap() {
    return this.apiService.getMapData();
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
