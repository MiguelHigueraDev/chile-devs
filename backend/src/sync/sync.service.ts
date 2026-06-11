import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { count, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  developerLanguages,
  developers,
  locations,
  syncRuns,
} from '../db/schema';
import { GithubService, type GitHubUserResult } from './github.service';

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

  async runSync(): Promise<{ usersUpserted: number; status: string }> {
    const token = this.config.get<string>('GITHUB_TOKEN', '');
    if (!token || token.includes('your_personal_access_token')) {
      throw new Error(
        'GITHUB_TOKEN is not configured. Set it in backend/.env before syncing.',
      );
    }

    if (this.isRunning) {
      this.logger.warn('Sync already in progress, skipping.');
      return { usersUpserted: 0, status: 'skipped' };
    }

    this.isRunning = true;
    const [run] = await this.db
      .insert(syncRuns)
      .values({ status: 'running' })
      .returning();

    let usersUpserted = 0;

    try {
      const allLocations = await this.db.select().from(locations);
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

      this.logger.log(
        `Starting sync for ${uniqueTerms.length} search terms...`,
      );

      for (const { term } of uniqueTerms) {
        this.logger.log(`Searching: "${term}"`);

        try {
          await this.github.searchUsersByLocation(term, async (users) => {
            for (const user of users) {
              const classified = this.github.classifyLocation(
                user.rawLocation,
                allLocations,
              );

              await this.upsertDeveloper(user, classified.id);

              usersUpserted += 1;
            }
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown search error';
          this.logger.warn(`Skipping term "${term}": ${message}`);
        }
      }

      await this.db
        .update(syncRuns)
        .set({
          finishedAt: new Date(),
          usersUpserted,
          status: 'completed',
        })
        .where(eq(syncRuns.id, run.id));

      this.logger.log(
        `Sync completed. Upserted ${usersUpserted} developer records.`,
      );
      return { usersUpserted, status: 'completed' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown sync error';

      await this.db
        .update(syncRuns)
        .set({
          finishedAt: new Date(),
          usersUpserted,
          status: 'failed',
          errorMessage: message,
        })
        .where(eq(syncRuns.id, run.id));

      this.logger.error(`Sync failed: ${message}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async getLastSyncRun() {
    const runs = await this.db
      .select()
      .from(syncRuns)
      .orderBy(sql`${syncRuns.startedAt} DESC`)
      .limit(1);

    return runs[0] ?? null;
  }

  private async upsertDeveloper(
    user: GitHubUserResult,
    locationId: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(developers)
        .values({
          githubId: user.githubId,
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
          rawLocation: user.rawLocation,
          locationId,
          followers: user.followers,
          contributions: user.contributions,
          totalStars: user.totalStars,
          topLanguages: user.topLanguages,
          profileUrl: user.profileUrl,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: developers.githubId,
          set: {
            login: user.login,
            name: user.name,
            avatarUrl: user.avatarUrl,
            rawLocation: user.rawLocation,
            locationId,
            followers: user.followers,
            contributions: user.contributions,
            totalStars: user.totalStars,
            topLanguages: user.topLanguages,
            profileUrl: user.profileUrl,
            lastSeenAt: new Date(),
          },
        });

      await tx
        .delete(developerLanguages)
        .where(sql`developer_github_id = ${user.githubId}`);

      if (user.topLanguages.length > 0) {
        const dedupedLanguages = new Map<
          string,
          { name: string; share: number }
        >();
        for (const lang of user.topLanguages) {
          const key = lang.name.toLowerCase();
          const existing = dedupedLanguages.get(key);
          if (!existing || lang.share > existing.share) {
            dedupedLanguages.set(key, lang);
          }
        }

        await tx.insert(developerLanguages).values(
          [...dedupedLanguages.values()].map((lang) => ({
            developerGithubId: user.githubId,
            language: lang.name.toLowerCase(),
            share: lang.share,
          })),
        );
      }
    });
  }
}
