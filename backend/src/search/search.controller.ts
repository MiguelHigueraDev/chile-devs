import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  normalizeSearchInput,
  parseCsvParam,
  parsedQuerySchema,
  type ParsedQuery,
} from './search.types';

@Controller('api')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search/facets')
  getFacets() {
    return this.searchService.getFacets();
  }

  @Get('search')
  search(
    @Query('languages') languages?: string,
    @Query('langMode') langMode?: string,
    @Query('locations') locations?: string,
    @Query('zone') zone?: string,
    @Query('username') username?: string,
    @Query('name') name?: string,
    @Query('sort') sort?: string,
    @Query('shareLang') shareLang?: string,
  ) {
    const parsed = this.parseSearchQuery({
      languages,
      langMode,
      locations,
      zone,
      username,
      name,
      sort,
      shareLang,
    });

    return this.searchService.search(parsed);
  }

  private parseSearchQuery(input: {
    languages?: string;
    langMode?: string;
    locations?: string;
    zone?: string;
    username?: string;
    name?: string;
    sort?: string;
    shareLang?: string;
  }): ParsedQuery {
    const languageMode = input.langMode === 'all' ? 'all' : 'any';
    const zoneValue =
      input.zone === 'north' ||
      input.zone === 'central' ||
      input.zone === 'south'
        ? input.zone
        : null;

    const sortValue =
      input.sort === 'followers' ||
      input.sort === 'stars' ||
      input.sort === 'rank' ||
      input.sort === 'languageShare'
        ? input.sort
        : 'contributions';

    const candidate: ParsedQuery = {
      languages: parseCsvParam(input.languages),
      languageMode,
      locationSlugs: parseCsvParam(input.locations),
      zone: zoneValue,
      username: input.username?.trim() || null,
      displayName: input.name?.trim() || null,
      sort: sortValue,
      shareLanguage: input.shareLang?.trim() || null,
    };

    const result = parsedQuerySchema.safeParse(normalizeSearchInput(candidate));
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message).join(', '),
      );
    }

    return result.data;
  }
}
