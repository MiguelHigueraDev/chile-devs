import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('api')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search')
  search(@Query('q') q?: string) {
    if (!q?.trim()) {
      throw new BadRequestException('Query parameter "q" is required');
    }

    const trimmed = q.trim();
    return this.searchService.search(trimmed);
  }
}
