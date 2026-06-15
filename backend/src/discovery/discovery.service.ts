import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  notInArray,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { developers, locations, repoCandidates } from '../db/schema';
import { resolveRegionLocationSlug } from '../search/geo.data';
import {
  scatterRepoCoordinate,
  warmScatterRegionIndex,
} from '../search/scatter';
import { GithubService } from '../sync/github.service';
import { DiscoveryExploredDevsStore } from './discovery-explored-devs.store';
import {
  type FlatRepo,
  type PoolDev,
  computeResetThreshold,
  rankReposWithRegionBias,
  selectDevsForBatch,
  shouldResetExploredDevs,
} from './discovery-ranking';
import {
  type CandidateSortKey,
  type ListCandidatesInput,
  type RefreshCandidatesInput,
  type RefreshCandidatesSummary,
} from './discovery.types';

const DEFAULT_PER_REGION = 10;
const DEFAULT_PER_COUNTRY = 50;
const DEFAULT_TOP_DEVS = 300;
const DEFAULT_REPOS_PER_DEV = 10;
const DEFAULT_DEV_ROTATION_FRACTION = 0.2;
const DEFAULT_FEATURED_REPO_CAP = 2;
const MAX_PER_SCOPE = 500;
const MAX_TOP_DEVS = 2000;
const MAX_REPOS_PER_DEV = 100;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

@Injectable()
export class DiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly github: GithubService,
    private readonly exploredDevsStore: DiscoveryExploredDevsStore,
  ) {}

  onModuleInit(): void {
    warmScatterRegionIndex();
  }

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

  private resolveTopDevs(input?: number): number {
    const fallback =
      Number(this.configService.get<string>('DISCOVERY_TOP_DEVS')) ||
      DEFAULT_TOP_DEVS;
    const value = input ?? fallback;
    return Math.max(1, Math.min(Math.trunc(value), MAX_TOP_DEVS));
  }

  private resolveReposPerDev(input?: number): number {
    const fallback =
      Number(this.configService.get<string>('DISCOVERY_REPOS_PER_DEV')) ||
      DEFAULT_REPOS_PER_DEV;
    const value = input ?? fallback;
    return Math.max(1, Math.min(Math.trunc(value), MAX_REPOS_PER_DEV));
  }

  private resolveDevRotationFraction(): number {
    const configured = Number(
      this.configService.get<string>('DISCOVERY_DEV_ROTATION_FRACTION'),
    );
    if (Number.isFinite(configured) && configured > 0 && configured <= 1) {
      return configured;
    }
    return DEFAULT_DEV_ROTATION_FRACTION;
  }

  private resolveFeaturedRepoCap(): number {
    const configured = Number(
      this.configService.get<string>('DISCOVERY_FEATURED_REPO_CAP'),
    );
    if (Number.isFinite(configured) && configured >= 1) {
      return Math.trunc(configured);
    }
    return DEFAULT_FEATURED_REPO_CAP;
  }

  async refreshCandidates(
    input: RefreshCandidatesInput = {},
  ): Promise<RefreshCandidatesSummary> {
    const perRegion = this.resolvePerRegion(input.perRegion);
    const perCountry = this.resolvePerCountry(input.perCountry);
    const topDevs = this.resolveTopDevs(input.topDevs);
    const reposPerDev = this.resolveReposPerDev(input.reposPerDev);
    const rotationFraction = this.resolveDevRotationFraction();
    const featuredRepoCap = this.resolveFeaturedRepoCap();

    const locationRows = await this.db
      .select({ id: locations.id, slug: locations.slug, kind: locations.kind })
      .from(locations);
    const locationIdBySlug = new Map(
      locationRows.map((row) => [row.slug, row.id]),
    );
    const slugByLocationId = new Map(
      locationRows.map((row) => [row.id, row.slug]),
    );
    const regionCount = locationRows.filter(
      (row) => row.kind === 'region',
    ).length;

    const [{ totalDeveloperCount }] = await this.db
      .select({ totalDeveloperCount: count() })
      .from(developers);

    const totalDevs = Number(totalDeveloperCount);
    const exploredResetThreshold = computeResetThreshold(
      totalDevs,
      rotationFraction,
    );

    let exploredCount = await this.exploredDevsStore.count();
    const rotationReset = shouldResetExploredDevs(
      exploredCount,
      totalDevs,
      rotationFraction,
    );
    if (rotationReset) {
      await this.exploredDevsStore.reset();
      exploredCount = 0;
    }

    const exploredGithubIds = await this.exploredDevsStore.getAll();

    const featuredOwnerRows = await this.db
      .select({
        ownerGithubId: repoCandidates.ownerGithubId,
        promotedCount: sql<number>`count(*)::int`,
      })
      .from(repoCandidates)
      .where(eq(repoCandidates.status, 'promoted'))
      .groupBy(repoCandidates.ownerGithubId)
      .having(gte(sql`count(*)`, featuredRepoCap));

    const featuredGithubIds = new Set(
      featuredOwnerRows.map((row) => row.ownerGithubId),
    );

    const exclusionGithubIds = new Set([
      ...exploredGithubIds,
      ...featuredGithubIds,
    ]);

    const regionPromotedRows = await this.db
      .select({
        regionLocationId: repoCandidates.regionLocationId,
        promotedCount: sql<number>`count(*)::int`,
      })
      .from(repoCandidates)
      .where(
        and(
          eq(repoCandidates.status, 'promoted'),
          isNotNull(repoCandidates.regionLocationId),
        ),
      )
      .groupBy(repoCandidates.regionLocationId);

    const regionPromotedCount = new Map<number, number>(
      regionPromotedRows
        .filter((row) => row.regionLocationId != null)
        .map((row) => [row.regionLocationId!, Number(row.promotedCount)]),
    );

    const allDevRows = await this.db
      .select({
        githubId: developers.githubId,
        login: developers.login,
        locationId: developers.locationId,
        locationSlug: locations.slug,
        locationKind: locations.kind,
        totalStars: developers.totalStars,
      })
      .from(developers)
      .innerJoin(locations, eq(developers.locationId, locations.id))
      .orderBy(desc(developers.totalStars), asc(developers.githubId));

    const devPool: PoolDev[] = allDevRows.map((dev) => {
      const regionSlug = resolveRegionLocationSlug(
        dev.locationSlug,
        dev.locationKind,
      );
      const regionLocationId = regionSlug
        ? (locationIdBySlug.get(regionSlug) ?? null)
        : null;

      return {
        githubId: dev.githubId,
        login: dev.login,
        locationId: dev.locationId,
        locationSlug: dev.locationSlug,
        locationKind: dev.locationKind,
        totalStars: dev.totalStars,
        regionLocationId,
      };
    });

    const devRows = selectDevsForBatch({
      pool: devPool,
      exclusionGithubIds,
      regionPromotedCount,
      batchSize: topDevs,
      regionCount,
    });
    const devsExcludedFeatured = devPool.filter((dev) =>
      featuredGithubIds.has(dev.githubId),
    ).length;

    const logins = devRows.map((row) => row.login);
    const reposByLogin = await this.github.fetchTopRepos(logins, reposPerDev);

    const flatRepos: FlatRepo[] = [];
    let reposScanned = 0;

    for (const dev of devRows) {
      const repos = reposByLogin.get(dev.login) ?? [];
      reposScanned += repos.length;

      for (const repo of repos) {
        flatRepos.push({
          repoGithubId: repo.repoGithubId,
          ownerGithubId: dev.githubId,
          locationId: dev.locationId,
          regionLocationId: dev.regionLocationId,
          nameWithOwner: repo.nameWithOwner,
          name: repo.name,
          description: repo.description,
          url: repo.url,
          primaryLanguage: repo.primaryLanguage,
          stars: repo.stars,
          forks: repo.forks,
        });
      }
    }

    const excludedRows = await this.db
      .select({ repoGithubId: repoCandidates.repoGithubId })
      .from(repoCandidates)
      .where(inArray(repoCandidates.status, ['promoted', 'rejected']));

    const excludedRepoIds = new Set(
      excludedRows.map((row) => row.repoGithubId),
    );
    const eligibleRepos = flatRepos.filter(
      (repo) => !excludedRepoIds.has(repo.repoGithubId),
    );

    const selected = rankReposWithRegionBias(
      eligibleRepos,
      perRegion,
      perCountry,
      regionPromotedCount,
    );
    const selectedRows = [...selected.values()];
    const selectedIds = selectedRows.map((row) => row.repoGithubId);

    await this.db.transaction(async (tx) => {
      if (selectedRows.length > 0) {
        await tx
          .insert(repoCandidates)
          .values(
            selectedRows.map((row) => ({
              repoGithubId: row.repoGithubId,
              ownerGithubId: row.ownerGithubId,
              locationId: row.locationId,
              regionLocationId: row.regionLocationId,
              nameWithOwner: row.nameWithOwner,
              name: row.name,
              description: row.description,
              url: row.url,
              primaryLanguage: row.primaryLanguage,
              stars: row.stars,
              forks: row.forks,
              regionRank: row.regionRank,
              countryRank: row.countryRank,
              starsAtSelection: row.stars,
            })),
          )
          .onConflictDoUpdate({
            target: repoCandidates.repoGithubId,
            set: {
              ownerGithubId: sql`excluded.owner_github_id`,
              locationId: sql`excluded.location_id`,
              regionLocationId: sql`excluded.region_location_id`,
              nameWithOwner: sql`excluded.name_with_owner`,
              name: sql`excluded.name`,
              description: sql`excluded.description`,
              url: sql`excluded.url`,
              primaryLanguage: sql`excluded.primary_language`,
              stars: sql`excluded.stars`,
              forks: sql`excluded.forks`,
              regionRank: sql`excluded.region_rank`,
              countryRank: sql`excluded.country_rank`,
              starsAtSelection: sql`excluded.stars_at_selection`,
              selectedAt: sql`now()`,
            },
          });

        const promotedRows = await tx
          .select({ repoGithubId: repoCandidates.repoGithubId })
          .from(repoCandidates)
          .where(
            and(
              eq(repoCandidates.status, 'promoted'),
              inArray(repoCandidates.repoGithubId, selectedIds),
            ),
          );

        const selectedById = new Map(
          selectedRows.map((row) => [row.repoGithubId, row]),
        );

        for (const { repoGithubId } of promotedRows) {
          const row = selectedById.get(repoGithubId);
          if (!row) {
            continue;
          }

          const regionSlug = row.regionLocationId
            ? (slugByLocationId.get(row.regionLocationId) ?? null)
            : null;
          const coordinate = scatterRepoCoordinate({
            repoGithubId,
            regionSlug,
          });

          await tx
            .update(repoCandidates)
            .set({
              scatterLat: coordinate.lat,
              scatterLng: coordinate.lng,
            })
            .where(eq(repoCandidates.repoGithubId, repoGithubId));
        }
      }

      const dropFilter =
        selectedIds.length > 0
          ? and(
              eq(repoCandidates.status, 'candidate'),
              notInArray(repoCandidates.repoGithubId, selectedIds),
            )
          : eq(repoCandidates.status, 'candidate');

      await tx.delete(repoCandidates).where(dropFilter);
    });

    let exploredTotal = exploredCount + devRows.length;
    try {
      await this.exploredDevsStore.add(devRows.map((dev) => dev.githubId));
      exploredTotal = await this.exploredDevsStore.count();
    } catch (error) {
      this.logger.warn(
        'Failed to update explored devs in Redis after candidate refresh',
        error instanceof Error ? error.stack : error,
      );
    }

    const [{ totalCandidates }] = await this.db
      .select({ totalCandidates: sql<number>`count(*)::int` })
      .from(repoCandidates)
      .where(eq(repoCandidates.status, 'candidate'));

    const [{ promotedRetained }] = await this.db
      .select({ promotedRetained: sql<number>`count(*)::int` })
      .from(repoCandidates)
      .where(eq(repoCandidates.status, 'promoted'));

    const [{ rejectedRetained }] = await this.db
      .select({ rejectedRetained: sql<number>`count(*)::int` })
      .from(repoCandidates)
      .where(eq(repoCandidates.status, 'rejected'));

    const summary: RefreshCandidatesSummary = {
      perRegion,
      perCountry,
      topDevs,
      reposPerDev,
      reposScanned,
      regionPicks: selectedRows.filter((row) => row.regionRank != null).length,
      countryPicks: selectedRows.filter((row) => row.countryRank != null)
        .length,
      totalSelected: selectedRows.length,
      totalCandidates: Number(totalCandidates),
      promotedRetained: Number(promotedRetained),
      rejectedRetained: Number(rejectedRetained),
      devsSelected: devRows.length,
      devsExcludedFeatured,
      exploredTotal,
      exploredResetThreshold,
      rotationReset,
    };

    this.logger.log(
      `Repo candidate refresh complete: scanned ${reposScanned} repos from ${devRows.length} devs (${exploredTotal}/${exploredResetThreshold} explored, reset=${rotationReset}), excluded ${excludedRepoIds.size} promoted/rejected repos and ${devsExcludedFeatured} featured devs, selected ${summary.totalSelected} (${summary.regionPicks} regional, ${summary.countryPicks} national), ${summary.totalCandidates} awaiting review, ${summary.promotedRetained} promoted retained`,
    );

    return summary;
  }

  private orderByForSort(sort: CandidateSortKey) {
    switch (sort) {
      case 'regionRank':
        return [
          sql`${repoCandidates.regionRank} ASC NULLS LAST`,
          desc(repoCandidates.starsAtSelection),
          asc(repoCandidates.repoGithubId),
        ];
      case 'countryRank':
        return [
          sql`${repoCandidates.countryRank} ASC NULLS LAST`,
          desc(repoCandidates.starsAtSelection),
          asc(repoCandidates.repoGithubId),
        ];
      case 'stars':
      default:
        return [
          desc(repoCandidates.starsAtSelection),
          asc(repoCandidates.repoGithubId),
        ];
    }
  }

  async listCandidates(input: ListCandidatesInput = {}) {
    let limit = DEFAULT_LIST_LIMIT;
    if (input.limit !== undefined && Number.isFinite(input.limit)) {
      limit = input.limit;
    }
    limit = Math.max(1, Math.min(limit, MAX_LIST_LIMIT));

    let offset = 0;
    if (input.offset !== undefined && Number.isFinite(input.offset)) {
      offset = Math.max(0, Math.trunc(input.offset));
    }
    const sort = input.sort ?? 'stars';
    const ownerLocations = alias(locations, 'owner_locations');
    const regionLocations = alias(locations, 'region_locations');

    const filters: SQL[] = [];
    if (input.status) {
      filters.push(eq(repoCandidates.status, input.status));
    }
    if (input.regionSlug) {
      filters.push(eq(regionLocations.slug, input.regionSlug));
    }
    if (input.scope === 'region') {
      filters.push(isNotNull(repoCandidates.regionRank));
    } else if (input.scope === 'country') {
      filters.push(isNotNull(repoCandidates.countryRank));
    }
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const rows = await this.db
      .select({
        repoGithubId: repoCandidates.repoGithubId,
        nameWithOwner: repoCandidates.nameWithOwner,
        name: repoCandidates.name,
        description: repoCandidates.description,
        url: repoCandidates.url,
        primaryLanguage: repoCandidates.primaryLanguage,
        stars: repoCandidates.stars,
        forks: repoCandidates.forks,
        regionRank: repoCandidates.regionRank,
        countryRank: repoCandidates.countryRank,
        starsAtSelection: repoCandidates.starsAtSelection,
        status: repoCandidates.status,
        selectedAt: repoCandidates.selectedAt,
        promotedAt: repoCandidates.promotedAt,
        promotedByLogin: repoCandidates.promotedByLogin,
        ownerLogin: developers.login,
        ownerName: developers.name,
        ownerAvatarUrl: developers.avatarUrl,
        ownerProfileUrl: developers.profileUrl,
        locationSlug: ownerLocations.slug,
        locationName: ownerLocations.name,
        locationKind: ownerLocations.kind,
      })
      .from(repoCandidates)
      .innerJoin(
        developers,
        eq(repoCandidates.ownerGithubId, developers.githubId),
      )
      .innerJoin(
        ownerLocations,
        eq(repoCandidates.locationId, ownerLocations.id),
      )
      .leftJoin(
        regionLocations,
        eq(repoCandidates.regionLocationId, regionLocations.id),
      )
      .where(whereClause)
      .orderBy(...this.orderByForSort(sort))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(repoCandidates)
      .innerJoin(
        ownerLocations,
        eq(repoCandidates.locationId, ownerLocations.id),
      )
      .leftJoin(
        regionLocations,
        eq(repoCandidates.regionLocationId, regionLocations.id),
      )
      .where(whereClause);

    return {
      candidates: pageRows.map((row) => ({
        repoGithubId: row.repoGithubId,
        nameWithOwner: row.nameWithOwner,
        name: row.name,
        description: row.description,
        url: row.url,
        primaryLanguage: row.primaryLanguage,
        stars: row.stars,
        forks: row.forks,
        regionRank: row.regionRank,
        countryRank: row.countryRank,
        starsAtSelection: row.starsAtSelection,
        status: row.status,
        selectedAt: row.selectedAt.toISOString(),
        promotedAt: row.promotedAt ? row.promotedAt.toISOString() : null,
        promotedByLogin: row.promotedByLogin,
        owner: {
          login: row.ownerLogin,
          name: row.ownerName,
          avatarUrl: row.ownerAvatarUrl,
          profileUrl: row.ownerProfileUrl,
        },
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

  private async getCandidateForPromotion(repoGithubId: string) {
    const regionLocations = alias(locations, 'region_locations');
    const [row] = await this.db
      .select({
        repoGithubId: repoCandidates.repoGithubId,
        regionSlug: regionLocations.slug,
      })
      .from(repoCandidates)
      .leftJoin(
        regionLocations,
        eq(repoCandidates.regionLocationId, regionLocations.id),
      )
      .where(eq(repoCandidates.repoGithubId, repoGithubId))
      .limit(1);

    return row ?? null;
  }

  async promote(repoGithubId: string, adminLogin: string) {
    const candidate = await this.getCandidateForPromotion(repoGithubId);
    if (!candidate) {
      throw new NotFoundException(`Repo candidate "${repoGithubId}" not found`);
    }

    const regionSlug = candidate.regionSlug ?? null;
    const coordinate = scatterRepoCoordinate({
      repoGithubId,
      regionSlug,
    });

    await this.db
      .update(repoCandidates)
      .set({
        status: 'promoted',
        promotedAt: new Date(),
        promotedByLogin: adminLogin,
        scatterLat: coordinate.lat,
        scatterLng: coordinate.lng,
      })
      .where(eq(repoCandidates.repoGithubId, repoGithubId));

    return { repoGithubId, status: 'promoted' as const };
  }

  async reject(repoGithubId: string) {
    const candidate = await this.getCandidateForPromotion(repoGithubId);
    if (!candidate) {
      throw new NotFoundException(`Repo candidate "${repoGithubId}" not found`);
    }

    await this.db
      .update(repoCandidates)
      .set({
        status: 'rejected',
        promotedAt: null,
        promotedByLogin: null,
        scatterLat: null,
        scatterLng: null,
      })
      .where(eq(repoCandidates.repoGithubId, repoGithubId));

    return { repoGithubId, status: 'rejected' as const };
  }

  async reset(repoGithubId: string) {
    const candidate = await this.getCandidateForPromotion(repoGithubId);
    if (!candidate) {
      throw new NotFoundException(`Repo candidate "${repoGithubId}" not found`);
    }

    await this.db
      .update(repoCandidates)
      .set({
        status: 'candidate',
        promotedAt: null,
        promotedByLogin: null,
        scatterLat: null,
        scatterLng: null,
      })
      .where(eq(repoCandidates.repoGithubId, repoGithubId));

    return { repoGithubId, status: 'candidate' as const };
  }
}
