import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { count, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { developers, locations, syncRuns } from '../db/schema';
import {
  DeveloperWriterService,
  type ExistingDeveloper,
} from '../developers/developer-writer.service';
import { ExcludedUsersService } from '../exclusion/excluded-users.service';
import {
  GithubService,
  type GitHubEnrichment,
  type GitHubSearchHit,
} from './github.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private isRunning = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly github: GithubService,
    private readonly config: ConfigService,
    private readonly excludedUsersService: ExcludedUsersService,
    private readonly writer: DeveloperWriterService,
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

    // Load resume state before inserting the new run, otherwise the helper
    // would read the freshly created 'running' row instead of the last failed run.
    const completedTerms = new Set<string>(
      await this.loadResumableCompletedTerms(),
    );

    const [run] = await this.db
      .insert(syncRuns)
      .values({ status: 'running' })
      .returning();

    let usersUpserted = 0;
    let usersDiscovered = 0;
    let usersUpdated = 0;
    let lastLocationId: number | null = null;

    const processedThisRun = new Set<string>();
    const enrichmentTtlMs = this.getEnrichmentTtlMs();
    const excludedGithubIds =
      await this.excludedUsersService.loadExcludedGithubIds();

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
            const candidateHits = hits.filter(
              (hit) => !processedThisRun.has(hit.githubId),
            );
            const newHits: GitHubSearchHit[] = [];
            for (const hit of candidateHits) {
              if (await this.isSyncExcluded(hit.githubId, excludedGithubIds)) {
                continue;
              }
              newHits.push(hit);
            }

            for (const hit of newHits) {
              processedThisRun.add(hit.githubId);
            }

            if (newHits.length === 0) {
              return;
            }

            const existingById = await this.writer.loadExistingDevelopers(
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
                existing.rankScore != null &&
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
              if (await this.isSyncExcluded(hit.githubId, excludedGithubIds)) {
                continue;
              }

              const classified = this.github.classifyLocation(
                hit.rawLocation,
                allLocations,
              );
              const isNew = !existingById.has(hit.githubId);

              if (!enrichment.has(hit.login)) {
                const existing = existingById.get(hit.githubId);
                if (!existing) {
                  this.logger.warn(
                    `Enrichment missing for @${hit.login}, skipping new developer insert`,
                  );
                  continue;
                }

                this.logger.warn(
                  `Enrichment missing for @${hit.login}, preserving stored metrics`,
                );
                await this.writer.upsertDeveloperLightweight(
                  hit,
                  this.writer.toEnrichment(existing),
                  classified.id,
                );
                lastLocationId = classified.id;
                usersUpserted += 1;
                usersUpdated += 1;
                continue;
              }

              const stats = enrichment.get(hit.login)!;
              await this.writer.upsertDeveloper(hit, stats, classified.id);

              lastLocationId = classified.id;
              usersUpserted += 1;
              if (isNew) {
                usersDiscovered += 1;
                this.logger.log(
                  `Inserted new developer: @${hit.login} (location: ${classified.slug}, raw: ${hit.rawLocation ?? 'none'})`,
                );
              } else {
                usersUpdated += 1;
              }
            }

            for (const { hit, existing } of freshHits) {
              if (await this.isSyncExcluded(hit.githubId, excludedGithubIds)) {
                continue;
              }

              const classified = this.github.classifyLocation(
                hit.rawLocation,
                allLocations,
              );

              await this.writer.upsertDeveloperLightweight(
                hit,
                {
                  contributions: existing.contributions,
                  commits: existing.commits,
                  prs: existing.prs,
                  issues: existing.issues,
                  reviews: existing.reviews,
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

          completedTerms.add(term);
          await this.db
            .update(syncRuns)
            .set({ completedTerms: [...completedTerms] })
            .where(eq(syncRuns.id, run.id));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown search error';
          this.logger.warn(`Skipping term "${term}": ${message}`);
        }
      }

      await this.writer.refreshRankings();

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

    if (await this.excludedUsersService.isExcluded(user.githubId)) {
      return {
        login: user.login,
        status: 'excluded',
        locationId: 0,
      };
    }

    const allLocations = await this.db.select().from(locations);
    const classified = this.github.classifyLocation(
      user.rawLocation,
      allLocations,
    );

    const existing = await this.writer.loadExistingDevelopers([user.githubId]);
    const isNew = !existing.has(user.githubId);

    if (!user.enrichment) {
      const stored = existing.get(user.githubId);
      if (!stored) {
        throw new ServiceUnavailableException(
          `Could not enrich GitHub user @${user.login}; try again later.`,
        );
      }

      this.logger.warn(
        `Enrichment missing for @${user.login}, preserving stored metrics`,
      );
      await this.writer.upsertDeveloperLightweight(
        user,
        this.writer.toEnrichment(stored),
        classified.id,
      );
    } else {
      await this.writer.upsertDeveloper(user, user.enrichment, classified.id);
    }

    await this.writer.refreshRankings();

    if (isNew) {
      this.logger.log(
        `Inserted new developer: @${user.login} (location: ${classified.slug}, raw: ${user.rawLocation ?? 'none'})`,
      );
    } else {
      this.logger.log(
        `Updated developer: @${user.login} (location: ${classified.slug}).`,
      );
    }

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

  private async isSyncExcluded(
    githubId: string,
    excludedGithubIds: Set<string>,
  ): Promise<boolean> {
    if (excludedGithubIds.has(githubId)) {
      return true;
    }

    if (await this.excludedUsersService.isExcluded(githubId)) {
      excludedGithubIds.add(githubId);
      return true;
    }

    return false;
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
}
