import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  notInArray,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { candidates, developers, locations } from '../db/schema';
import {
  type CandidateSortKey,
  type ListCandidatesInput,
  type RefreshCandidatesInput,
  type RefreshCandidatesSummary,
} from './discovery.types';

const DEFAULT_PER_REGION = 10;
const DEFAULT_PER_COUNTRY = 50;
const MAX_PER_SCOPE = 500;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

type RankedRow = {
  github_id: string;
  location_id: number;
  total_stars: number;
  rank: number;
};

type SelectedCandidate = {
  developerGithubId: string;
  locationId: number;
  totalStarsAtSelection: number;
  regionRank: number | null;
  countryRank: number | null;
};

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
  ) {}

  private resolvePerRegion(input?: number): number {
    const fallback =
      Number(this.configService.get<string>('DISCOVERY_TOP_PER_REGION')) ||
      DEFAULT_PER_REGION;
    const value = input ?? fallback;
    return Math.max(1, Math.min(Math.trunc(value), MAX_PER_SCOPE));
  }

  private resolvePerCountry(input?: number): number {
    const fallback =
      Number(this.configService.get<string>('DISCOVERY_TOP_COUNTRY')) ||
      DEFAULT_PER_COUNTRY;
    const value = input ?? fallback;
    return Math.max(1, Math.min(Math.trunc(value), MAX_PER_SCOPE));
  }

  async refreshCandidates(
    input: RefreshCandidatesInput = {},
  ): Promise<RefreshCandidatesSummary> {
    const perRegion = this.resolvePerRegion(input.perRegion);
    const perCountry = this.resolvePerCountry(input.perCountry);

    const regionRows = await this.db.execute<RankedRow>(sql`
      SELECT github_id, location_id, total_stars, rank FROM (
        SELECT
          d.github_id AS github_id,
          d.location_id AS location_id,
          d.total_stars AS total_stars,
          ROW_NUMBER() OVER (
            PARTITION BY d.location_id
            ORDER BY d.total_stars DESC, d.rank_score ASC NULLS LAST, d.github_id ASC
          ) AS rank
        FROM developers d
        JOIN locations l ON l.id = d.location_id
        WHERE l.kind = 'region'
      ) ranked
      WHERE rank <= ${perRegion}
    `);

    const countryRows = await this.db.execute<RankedRow>(sql`
      SELECT github_id, location_id, total_stars, rank FROM (
        SELECT
          d.github_id AS github_id,
          d.location_id AS location_id,
          d.total_stars AS total_stars,
          ROW_NUMBER() OVER (
            ORDER BY d.total_stars DESC, d.rank_score ASC NULLS LAST, d.github_id ASC
          ) AS rank
        FROM developers d
      ) ranked
      WHERE rank <= ${perCountry}
    `);

    const selected = new Map<string, SelectedCandidate>();

    for (const row of regionRows) {
      selected.set(row.github_id, {
        developerGithubId: row.github_id,
        locationId: Number(row.location_id),
        totalStarsAtSelection: Number(row.total_stars),
        regionRank: Number(row.rank),
        countryRank: null,
      });
    }

    for (const row of countryRows) {
      const existing = selected.get(row.github_id);
      if (existing) {
        existing.countryRank = Number(row.rank);
      } else {
        selected.set(row.github_id, {
          developerGithubId: row.github_id,
          locationId: Number(row.location_id),
          totalStarsAtSelection: Number(row.total_stars),
          regionRank: null,
          countryRank: Number(row.rank),
        });
      }
    }

    const selectedRows = [...selected.values()];
    const selectedIds = selectedRows.map((row) => row.developerGithubId);

    await this.db.transaction(async (tx) => {
      if (selectedRows.length > 0) {
        // Upsert keeps existing `status` untouched on conflict, so already
        // promoted/rejected developers stay sticky while only their ranks
        // get refreshed. New rows default to status 'candidate'.
        await tx
          .insert(candidates)
          .values(
            selectedRows.map((row) => ({
              developerGithubId: row.developerGithubId,
              locationId: row.locationId,
              regionRank: row.regionRank,
              countryRank: row.countryRank,
              totalStarsAtSelection: row.totalStarsAtSelection,
            })),
          )
          .onConflictDoUpdate({
            target: candidates.developerGithubId,
            set: {
              locationId: sql`excluded.location_id`,
              regionRank: sql`excluded.region_rank`,
              countryRank: sql`excluded.country_rank`,
              totalStarsAtSelection: sql`excluded.total_stars_at_selection`,
              selectedAt: sql`now()`,
            },
          });
      }

      // Drop developers that are no longer selected, but only if they are
      // still plain candidates. Promoted/rejected rows are retained.
      const dropFilter =
        selectedIds.length > 0
          ? and(
              eq(candidates.status, 'candidate'),
              notInArray(candidates.developerGithubId, selectedIds),
            )
          : eq(candidates.status, 'candidate');

      await tx.delete(candidates).where(dropFilter);
    });

    const [{ totalCandidates }] = await this.db
      .select({ totalCandidates: sql<number>`count(*)::int` })
      .from(candidates)
      .where(eq(candidates.status, 'candidate'));

    const [{ promotedRetained }] = await this.db
      .select({ promotedRetained: sql<number>`count(*)::int` })
      .from(candidates)
      .where(eq(candidates.status, 'promoted'));

    const [{ rejectedRetained }] = await this.db
      .select({ rejectedRetained: sql<number>`count(*)::int` })
      .from(candidates)
      .where(eq(candidates.status, 'rejected'));

    const summary: RefreshCandidatesSummary = {
      perRegion,
      perCountry,
      regionPicks: selectedRows.filter((row) => row.regionRank != null).length,
      countryPicks: selectedRows.filter((row) => row.countryRank != null).length,
      totalSelected: selectedRows.length,
      totalCandidates: Number(totalCandidates),
      promotedRetained: Number(promotedRetained),
      rejectedRetained: Number(rejectedRetained),
    };

    this.logger.log(
      `Candidate refresh complete: ${summary.totalSelected} selected (${summary.regionPicks} regional, ${summary.countryPicks} national), ${summary.promotedRetained} promoted retained`,
    );

    return summary;
  }

  private orderByForSort(sort: CandidateSortKey) {
    switch (sort) {
      case 'regionRank':
        return [
          sql`${candidates.regionRank} ASC NULLS LAST`,
          desc(candidates.totalStarsAtSelection),
        ];
      case 'countryRank':
        return [
          sql`${candidates.countryRank} ASC NULLS LAST`,
          desc(candidates.totalStarsAtSelection),
        ];
      case 'stars':
      default:
        return [
          desc(candidates.totalStarsAtSelection),
          asc(candidates.developerGithubId),
        ];
    }
  }

  async listCandidates(input: ListCandidatesInput = {}) {
    const limit = Math.max(
      1,
      Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, input.offset ?? 0);
    const sort = input.sort ?? 'stars';

    const filters: SQL[] = [];
    if (input.status) {
      filters.push(eq(candidates.status, input.status));
    }
    if (input.regionSlug) {
      filters.push(eq(locations.slug, input.regionSlug));
    }
    if (input.scope === 'region') {
      filters.push(isNotNull(candidates.regionRank));
    } else if (input.scope === 'country') {
      filters.push(isNotNull(candidates.countryRank));
    }
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const rows = await this.db
      .select({
        login: developers.login,
        name: developers.name,
        avatarUrl: developers.avatarUrl,
        profileUrl: developers.profileUrl,
        totalStars: developers.totalStars,
        topLanguages: developers.topLanguages,
        rankLevel: developers.rankLevel,
        followers: developers.followers,
        contributions: developers.contributions,
        regionRank: candidates.regionRank,
        countryRank: candidates.countryRank,
        totalStarsAtSelection: candidates.totalStarsAtSelection,
        status: candidates.status,
        selectedAt: candidates.selectedAt,
        promotedAt: candidates.promotedAt,
        promotedByLogin: candidates.promotedByLogin,
        locationSlug: locations.slug,
        locationName: locations.name,
        locationKind: locations.kind,
      })
      .from(candidates)
      .innerJoin(
        developers,
        eq(candidates.developerGithubId, developers.githubId),
      )
      .innerJoin(locations, eq(candidates.locationId, locations.id))
      .where(whereClause)
      .orderBy(...this.orderByForSort(sort))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(candidates)
      .innerJoin(locations, eq(candidates.locationId, locations.id))
      .where(whereClause);

    return {
      candidates: pageRows.map((row) => ({
        login: row.login,
        name: row.name,
        avatarUrl: row.avatarUrl,
        profileUrl: row.profileUrl,
        totalStars: row.totalStars,
        topLanguages: row.topLanguages,
        rankLevel: row.rankLevel,
        followers: row.followers,
        contributions: row.contributions,
        regionRank: row.regionRank,
        countryRank: row.countryRank,
        totalStarsAtSelection: row.totalStarsAtSelection,
        status: row.status,
        selectedAt: row.selectedAt.toISOString(),
        promotedAt: row.promotedAt ? row.promotedAt.toISOString() : null,
        promotedByLogin: row.promotedByLogin,
        location: {
          slug: row.locationSlug,
          name: row.locationName,
          kind: row.locationKind,
        },
      })),
      total: Number(total),
      limit,
      offset,
      nextOffset: hasMore ? offset + limit : null,
      hasMore,
      sort,
    };
  }

  private async getCandidateByLogin(login: string) {
    const [row] = await this.db
      .select({ developerGithubId: candidates.developerGithubId })
      .from(candidates)
      .innerJoin(
        developers,
        eq(candidates.developerGithubId, developers.githubId),
      )
      .where(eq(developers.login, login))
      .limit(1);
    return row ?? null;
  }

  async promote(login: string, adminLogin: string) {
    const candidate = await this.getCandidateByLogin(login);
    if (!candidate) {
      throw new NotFoundException(`Candidate "${login}" not found`);
    }

    await this.db
      .update(candidates)
      .set({
        status: 'promoted',
        promotedAt: new Date(),
        promotedByLogin: adminLogin,
      })
      .where(
        eq(candidates.developerGithubId, candidate.developerGithubId),
      );

    return { login, status: 'promoted' as const };
  }

  async reject(login: string) {
    const candidate = await this.getCandidateByLogin(login);
    if (!candidate) {
      throw new NotFoundException(`Candidate "${login}" not found`);
    }

    await this.db
      .update(candidates)
      .set({
        status: 'rejected',
        promotedAt: null,
        promotedByLogin: null,
      })
      .where(eq(candidates.developerGithubId, candidate.developerGithubId));

    return { login, status: 'rejected' as const };
  }

  async reset(login: string) {
    const candidate = await this.getCandidateByLogin(login);
    if (!candidate) {
      throw new NotFoundException(`Candidate "${login}" not found`);
    }

    await this.db
      .update(candidates)
      .set({
        status: 'candidate',
        promotedAt: null,
        promotedByLogin: null,
      })
      .where(eq(candidates.developerGithubId, candidate.developerGithubId));

    return { login, status: 'candidate' as const };
  }
}
