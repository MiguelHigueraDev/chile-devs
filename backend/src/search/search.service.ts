import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  developerLanguages,
  developers,
  locations,
  type TopLanguage,
} from '../db/schema';
import { resolveLocationSlugs } from './geo.data';
import { QueryParserService } from './query-parser.service';
import {
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_RESULTS,
  type ParsedQuery,
  type SearchInterpretation,
} from './search.types';

const NO_MATCHING_LOCATION_ID = -1;

type DeveloperRow = {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributions: number;
  followers: number;
  totalStars: number;
  topLanguages: TopLanguage[];
  profileUrl: string;
  rawLocation: string | null;
};

const developerSelect = {
  login: developers.login,
  name: developers.name,
  avatarUrl: developers.avatarUrl,
  contributions: developers.contributions,
  followers: developers.followers,
  totalStars: developers.totalStars,
  topLanguages: developers.topLanguages,
  profileUrl: developers.profileUrl,
  rawLocation: developers.rawLocation,
} as const;

@Injectable()
export class SearchService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly queryParser: QueryParserService,
  ) {}

  async search(rawQuery: string) {
    const query = rawQuery.trim();
    if (!query) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    if (query.length > MAX_SEARCH_QUERY_LENGTH) {
      throw new BadRequestException(
        `Query must be at most ${MAX_SEARCH_QUERY_LENGTH} characters`,
      );
    }

    const parsed = await this.queryParser.parseQuery(query);
    const resolvedLocationSlugs = [
      ...resolveLocationSlugs(parsed.locationSlugs, parsed.zone),
    ];
    const interpretation = this.buildInterpretation(
      parsed,
      resolvedLocationSlugs,
    );
    const developersResult = await this.executeSearch(
      parsed,
      resolvedLocationSlugs,
    );

    return {
      query,
      interpretation,
      developers: developersResult,
    };
  }

  private buildInterpretation(
    parsed: ParsedQuery,
    resolvedLocationSlugs: string[],
  ): SearchInterpretation {
    return {
      ...parsed,
      resolvedLocationSlugs,
    };
  }

  private async executeSearch(
    parsed: ParsedQuery,
    resolvedLocationSlugs: string[],
  ): Promise<DeveloperRow[]> {
    const filters: SQL[] = [];
    const languageFilters = this.buildLanguageFilters(parsed);
    if (languageFilters) {
      filters.push(languageFilters);
    }

    const locationFilter = await this.buildLocationFilter(
      resolvedLocationSlugs,
    );
    if (locationFilter) {
      filters.push(locationFilter);
    }

    const shareLanguage = this.resolveShareLanguage(parsed);
    const whereClause =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters);

    if (parsed.sort === 'languageShare' && shareLanguage) {
      const rows = await this.db
        .select(developerSelect)
        .from(developers)
        .innerJoin(
          developerLanguages,
          and(
            eq(developerLanguages.developerGithubId, developers.githubId),
            eq(developerLanguages.language, shareLanguage),
          ),
        )
        .where(whereClause)
        .orderBy(
          desc(developerLanguages.share),
          desc(developers.totalStars),
          asc(developers.login),
        )
        .limit(MAX_SEARCH_RESULTS);

      return rows;
    }

    const sortColumn =
      parsed.sort === 'followers'
        ? developers.followers
        : parsed.sort === 'stars'
          ? developers.totalStars
          : developers.contributions;

    const rows = await this.db
      .select(developerSelect)
      .from(developers)
      .where(whereClause)
      .orderBy(desc(sortColumn), asc(developers.login))
      .limit(MAX_SEARCH_RESULTS);

    return rows;
  }

  private buildLanguageFilters(parsed: ParsedQuery): SQL | undefined {
    if (parsed.languages.length === 0) {
      return undefined;
    }

    const perLanguage = parsed.languages.map((language) =>
      exists(
        this.db
          .select({ one: sql`1` })
          .from(developerLanguages)
          .where(
            and(
              eq(developerLanguages.developerGithubId, developers.githubId),
              eq(developerLanguages.language, language),
            ),
          ),
      ),
    );

    if (parsed.languageMode === 'all') {
      return and(...perLanguage);
    }

    return perLanguage.length === 1 ? perLanguage[0] : or(...perLanguage);
  }

  private async buildLocationFilter(
    resolvedLocationSlugs: string[],
  ): Promise<SQL | undefined> {
    if (resolvedLocationSlugs.length === 0) {
      return undefined;
    }

    const matchedLocations = await this.db
      .select({ id: locations.id })
      .from(locations)
      .where(inArray(locations.slug, resolvedLocationSlugs));

    if (matchedLocations.length === 0) {
      return eq(developers.locationId, NO_MATCHING_LOCATION_ID);
    }

    return inArray(
      developers.locationId,
      matchedLocations.map((location) => location.id),
    );
  }

  private resolveShareLanguage(parsed: ParsedQuery): string | null {
    if (parsed.shareLanguage) {
      return parsed.shareLanguage;
    }

    if (parsed.sort === 'languageShare' && parsed.languages.length === 1) {
      return parsed.languages[0] ?? null;
    }

    return null;
  }
}
