import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiService } from './api.service';

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

  @Get('locations/:slug/developers')
  async getLocationDevelopers(
    @Param('slug') slug: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const result = await this.apiService.getLocationDevelopers(
      slug,
      limit ?? 10,
    );

    if (!result) {
      throw new NotFoundException(`Location "${slug}" not found`);
    }

    return result;
  }
}
