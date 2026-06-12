import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { count, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  developerLanguages,
  developers,
  locations,
  syncRuns,
} from '../db/schema';
import type { TopLanguage } from '../db/schema';
import {
  GithubService,
  type GitHubEnrichment,
  type GitHubSearchHit,
} from './github.service';

type ExistingDeveloper = {
  githubId: string;
  contributions: number;
  totalStars: number;
  topLanguages: TopLanguage[];
  lastSeenAt: Date;
};

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private isRunning = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly github: GithubService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('GITHUB_TOKEN', '');
    if (!token || token.includes('your_personal_access_token')) {
      this.logger.warn(
        'GITHUB_TOKEN not configured — skipping initial sync. Set it in backend/.env',
      );
      return;
    }

    const [{ value: devCount }] = await this.db
      .select({ value: count() })
      .from(developers);

    if (devCount === 0) {
      this.logger.log('No developers in DB, triggering initial sync...');
      void this.runSync().catch((error: Error) => {
        this.logger.error(`Initial sync failed: ${error.message}`);
      });
    }
  }

  @Cron(CronExpression.EVERY_3_HOURS)
  async scheduledSync() {
    await this.runSync();
  }

  async runSync(): Promise<{
    usersUpserted: number;
    usersDiscovered: number;
    usersUpdated: number;
    status: string;
  }> {
    const token = this.config.get<string>('GITHUB_TOKEN', '');
    if (!token || token.includes('your_personal_access_token')) {
      throw new Error(
        'GITHUB_TOKEN is not configured. Set it in backend/.env before syncing.',
      );
    }

    if (this.isRunning) {
      this.logger.warn('Sync already in progress, skipping.');
      return {
        usersUpserted: 0,
        usersDiscovered: 0,
        usersUpdated: 0,
        status: 'skipped',
      };
    }

    this.isRunning = true;
    const [run] = await this.db
      .insert(syncRuns)
      .values({ status: 'running' })
      .returning();

    let usersUpserted = 0;
    let usersDiscovered = 0;
    let usersUpdated = 0;
    let lastLocationId: number | null = null;

    const processedThisRun = new Set<string>();
    const completedTerms = new Set<string>(
      await this.loadResumableCompletedTerms(),
    );
    const enrichmentTtlMs = this.getEnrichmentTtlMs();

    try {
      const allLocations = await this.db.select().from(locations);
      const uniqueTerms = this.buildUniqueSearchTerms(allLocations);

      const termsToProcess = uniqueTerms.filter(
        ({ term }) => !completedTerms.has(term),
      );

      if (completedTerms.size > 0) {
        this.logger.log(
          `Resuming sync, skipping ${completedTerms.size} already-completed terms.`,
        );
      }

      this.logger.log(
        `Starting sync for ${termsToProcess.length} search terms (${uniqueTerms.length} total)...`,
      );

      for (const { term } of termsToProcess) {
        this.logger.log(`Searching: "${term}"`);

        try {
          await this.github.searchUsersByLocation(term, async (hits) => {
            const newHits = hits.filter(
              (hit) => !processedThisRun.has(hit.githubId),
            );

            for (const hit of newHits) {
              processedThisRun.add(hit.githubId);
            }

            if (newHits.length === 0) {
              return;
            }

            const existingById = await this.loadExistingDevelopers(
              newHits.map((hit) => hit.githubId),
            );

            const needsEnrichment: GitHubSearchHit[] = [];
            const freshHits: Array<{
              hit: GitHubSearchHit;
              existing: ExistingDeveloper;
            }> = [];

            for (const hit of newHits) {
              const existing = existingById.get(hit.githubId);
              if (
                existing &&
                Date.now() - existing.lastSeenAt.getTime() < enrichmentTtlMs
              ) {
                freshHits.push({ hit, existing });
              } else {
                needsEnrichment.push(hit);
              }
            }

            const enrichment =
              needsEnrichment.length > 0
                ? await this.github.enrichUsers(
                    needsEnrichment.map((hit) => hit.login),
                  )
                : new Map<string, GitHubEnrichment>();

            for (const hit of needsEnrichment) {
              const classified = this.github.classifyLocation(
                hit.rawLocation,
                allLocations,
              );
              const stats = enrichment.get(hit.login) ?? {
                contributions: 0,
                totalStars: 0,
                topLanguages: [],
              };
              const isNew = !existingById.has(hit.githubId);

              await this.upsertDeveloper(hit, stats, classified.id);

              lastLocationId = classified.id;
              usersUpserted += 1;
              if (isNew) {
                usersDiscovered += 1;
              } else {
                usersUpdated += 1;
              }
            }

            for (const { hit, existing } of freshHits) {
              const classified = this.github.classifyLocation(
                hit.rawLocation,
                allLocations,
              );

              await this.upsertDeveloperLightweight(
                hit,
                {
                  contributions: existing.contributions,
                  totalStars: existing.totalStars,
                  topLanguages: existing.topLanguages,
                },
                classified.id,
              );

              lastLocationId = classified.id;
              usersUpserted += 1;
              usersUpdated += 1;
            }
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown search error';
          this.logger.warn(`Skipping term "${term}": ${message}`);
        }

        completedTerms.add(term);
        await this.db
          .update(syncRuns)
          .set({ completedTerms: [...completedTerms] })
          .where(eq(syncRuns.id, run.id));
      }

      await this.db
        .update(syncRuns)
        .set({
          finishedAt: new Date(),
          usersUpserted,
          usersDiscovered,
          usersUpdated,
          completedTerms: [...completedTerms],
          status: 'completed',
          lastLocationId,
        })
        .where(eq(syncRuns.id, run.id));

      this.logger.log(
        `Sync completed. ${usersUpserted} unique users (${usersDiscovered} new, ${usersUpdated} updated).`,
      );
      return {
        usersUpserted,
        usersDiscovered,
        usersUpdated,
        status: 'completed',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown sync error';

      await this.db
        .update(syncRuns)
        .set({
          finishedAt: new Date(),
          usersUpserted,
          usersDiscovered,
          usersUpdated,
          completedTerms: [...completedTerms],
          status: 'failed',
          errorMessage: message,
          lastLocationId,
        })
        .where(eq(syncRuns.id, run.id));

      this.logger.error(`Sync failed: ${message}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async syncUser(
    login: string,
  ): Promise<{ login: string; status: string; locationId: number }> {
    const token = this.config.get<string>('GITHUB_TOKEN', '');
    if (!token || token.includes('your_personal_access_token')) {
      throw new Error(
        'GITHUB_TOKEN is not configured. Set it in backend/.env before syncing.',
      );
    }

    const normalizedLogin = login.trim();
    this.logger.log(`Syncing user "${normalizedLogin}"...`);

    const user = await this.github.fetchUserByLogin(normalizedLogin);
    if (!user) {
      throw new NotFoundException(`GitHub user "${normalizedLogin}" not found`);
    }

    const allLocations = await this.db.select().from(locations);
    const classified = this.github.classifyLocation(
      user.rawLocation,
      allLocations,
    );

    await this.upsertDeveloper(
      user,
      {
        contributions: user.contributions,
        totalStars: user.totalStars,
        topLanguages: user.topLanguages,
      },
      classified.id,
    );

    this.logger.log(
      `Synced user "${user.login}" (location: ${classified.slug}).`,
    );

    return {
      login: user.login,
      status: 'completed',
      locationId: classified.id,
    };
  }

  async getLastSyncRun() {
    const runs = await this.db
      .select()
      .from(syncRuns)
      .orderBy(sql`${syncRuns.startedAt} DESC`)
      .limit(1);

    return runs[0] ?? null;
  }

  private buildUniqueSearchTerms(
    allLocations: (typeof locations.$inferSelect)[],
  ): Array<{ term: string; sourceLocationId: number }> {
    const kindOrder = { city: 0, region: 1, country: 2 } as const;
    const sortedLocations = [...allLocations].sort(
      (a, b) => kindOrder[a.kind] - kindOrder[b.kind],
    );

    const seenTerms = new Set<string>();
    const uniqueTerms: Array<{ term: string; sourceLocationId: number }> = [];

    for (const location of sortedLocations) {
      for (const term of location.searchTerms) {
        const key = term.toLowerCase().trim();
        if (!seenTerms.has(key)) {
          seenTerms.add(key);
          uniqueTerms.push({ term, sourceLocationId: location.id });
        }
      }
    }

    return uniqueTerms;
  }

  private async loadResumableCompletedTerms(): Promise<string[]> {
    const [lastRun] = await this.db
      .select({
        completedTerms: syncRuns.completedTerms,
        status: syncRuns.status,
      })
      .from(syncRuns)
      .orderBy(sql`${syncRuns.startedAt} DESC`)
      .limit(1);

    if (!lastRun || lastRun.status === 'completed') {
      return [];
    }

    return lastRun.completedTerms ?? [];
  }

  private getEnrichmentTtlMs(): number {
    const ttlHours = Number(
      this.config.get<string>('SYNC_ENRICHMENT_TTL_HOURS', '24'),
    );
    const hours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24;
    return hours * 60 * 60 * 1000;
  }

  private async loadExistingDevelopers(
    githubIds: string[],
  ): Promise<Map<string, ExistingDeveloper>> {
    if (githubIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        githubId: developers.githubId,
        contributions: developers.contributions,
        totalStars: developers.totalStars,
        topLanguages: developers.topLanguages,
        lastSeenAt: developers.lastSeenAt,
      })
      .from(developers)
      .where(inArray(developers.githubId, githubIds));

    return new Map(
      rows.map((row) => [
        row.githubId,
        {
          githubId: row.githubId,
          contributions: row.contributions,
          totalStars: row.totalStars,
          topLanguages: row.topLanguages,
          lastSeenAt: row.lastSeenAt,
        },
      ]),
    );
  }

  private async upsertDeveloper(
    hit: GitHubSearchHit,
    enrichment: GitHubEnrichment,
    locationId: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(developers)
        .values({
          githubId: hit.githubId,
          login: hit.login,
          name: hit.name,
          avatarUrl: hit.avatarUrl,
          rawLocation: hit.rawLocation,
          locationId,
          followers: hit.followers,
          contributions: enrichment.contributions,
          totalStars: enrichment.totalStars,
          topLanguages: enrichment.topLanguages,
          profileUrl: hit.profileUrl,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: developers.githubId,
          set: {
            login: hit.login,
            name: hit.name,
            avatarUrl: hit.avatarUrl,
            rawLocation: hit.rawLocation,
            locationId,
            followers: hit.followers,
            contributions: enrichment.contributions,
            totalStars: enrichment.totalStars,
            topLanguages: enrichment.topLanguages,
            profileUrl: hit.profileUrl,
            lastSeenAt: new Date(),
          },
        });

      await this.replaceDeveloperLanguages(
        tx,
        hit.githubId,
        enrichment.topLanguages,
      );
    });
  }

  private async upsertDeveloperLightweight(
    hit: GitHubSearchHit,
    _existingStats: GitHubEnrichment,
    locationId: number,
  ): Promise<void> {
    await this.db
      .update(developers)
      .set({
        login: hit.login,
        name: hit.name,
        avatarUrl: hit.avatarUrl,
        rawLocation: hit.rawLocation,
        locationId,
        followers: hit.followers,
        profileUrl: hit.profileUrl,
        lastSeenAt: new Date(),
      })
      .where(eq(developers.githubId, hit.githubId));
  }

  private async replaceDeveloperLanguages(
    tx: Parameters<Parameters<DrizzleDB['transaction']>[0]>[0],
    githubId: string,
    topLanguages: TopLanguage[],
  ): Promise<void> {
    await tx
      .delete(developerLanguages)
      .where(sql`developer_github_id = ${githubId}`);

    if (topLanguages.length === 0) {
      return;
    }

    const dedupedLanguages = new Map<string, { name: string; share: number }>();
    for (const lang of topLanguages) {
      const key = lang.name.toLowerCase();
      const existing = dedupedLanguages.get(key);
      if (!existing || lang.share > existing.share) {
        dedupedLanguages.set(key, lang);
      }
    }

    await tx.insert(developerLanguages).values(
      [...dedupedLanguages.values()].map((lang) => ({
        developerGithubId: githubId,
        language: lang.name.toLowerCase(),
        share: lang.share,
      })),
    );
  }
}
