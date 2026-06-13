import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  buildClearStaleRankingsSql,
  buildRankingUpdateSql,
} from '../db/ranking-sql';
import { developerLanguages, developers } from '../db/schema';
import type { TopLanguage } from '../db/schema';
import { calculateRank } from '../sync/rank';
import type { GitHubEnrichment, GitHubSearchHit } from '../sync/github.service';

export type ExistingDeveloper = {
  githubId: string;
  contributions: number;
  commits: number;
  prs: number;
  issues: number;
  reviews: number;
  totalStars: number;
  topLanguages: TopLanguage[];
  rankScore: number | null;
  lastSeenAt: Date;
};

/**
 * Shared persistence layer for writing a discovered/enriched developer into the
 * `developers` table. Used by both the location-search sync (SyncService) and the
 * candidate-discovery pipeline (DiscoveryService) so upsert + rank logic lives in
 * exactly one place.
 */
@Injectable()
export class DeveloperWriterService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async loadExistingDevelopers(
    githubIds: string[],
  ): Promise<Map<string, ExistingDeveloper>> {
    if (githubIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        githubId: developers.githubId,
        contributions: developers.contributions,
        commits: developers.commits,
        prs: developers.prs,
        issues: developers.issues,
        reviews: developers.reviews,
        totalStars: developers.totalStars,
        topLanguages: developers.topLanguages,
        rankScore: developers.rankScore,
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
          commits: row.commits,
          prs: row.prs,
          issues: row.issues,
          reviews: row.reviews,
          totalStars: row.totalStars,
          topLanguages: row.topLanguages,
          rankScore: row.rankScore,
          lastSeenAt: row.lastSeenAt,
        },
      ]),
    );
  }

  toEnrichment(existing: ExistingDeveloper): GitHubEnrichment {
    return {
      contributions: existing.contributions,
      commits: existing.commits,
      prs: existing.prs,
      issues: existing.issues,
      reviews: existing.reviews,
      totalStars: existing.totalStars,
      topLanguages: existing.topLanguages,
    };
  }

  // Turns raw GitHub stats into rankScore (0–100, lower is better) and rankLevel (S–C).
  buildRankFields(
    enrichment: GitHubEnrichment,
    followers: number,
  ): Pick<typeof developers.$inferInsert, 'rankScore' | 'rankLevel'> {
    const rank = calculateRank({
      commits: enrichment.commits,
      prs: enrichment.prs,
      issues: enrichment.issues,
      reviews: enrichment.reviews,
      stars: enrichment.totalStars,
      followers,
    });

    return {
      rankScore: rank.score,
      rankLevel: rank.level,
    };
  }

  async refreshRankings(): Promise<void> {
    await this.db.execute(buildClearStaleRankingsSql());
    await this.db.execute(buildRankingUpdateSql());
  }

  async upsertDeveloper(
    hit: GitHubSearchHit,
    enrichment: GitHubEnrichment,
    locationId: number,
  ): Promise<void> {
    const rankFields = this.buildRankFields(enrichment, hit.followers);

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
          commits: enrichment.commits,
          prs: enrichment.prs,
          issues: enrichment.issues,
          reviews: enrichment.reviews,
          totalStars: enrichment.totalStars,
          topLanguages: enrichment.topLanguages,
          profileUrl: hit.profileUrl,
          lastSeenAt: new Date(),
          ...rankFields,
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
            commits: enrichment.commits,
            prs: enrichment.prs,
            issues: enrichment.issues,
            reviews: enrichment.reviews,
            totalStars: enrichment.totalStars,
            topLanguages: enrichment.topLanguages,
            profileUrl: hit.profileUrl,
            lastSeenAt: new Date(),
            ...rankFields,
          },
        });

      await this.replaceDeveloperLanguages(
        tx,
        hit.githubId,
        enrichment.topLanguages,
      );
    });
  }

  async upsertDeveloperLightweight(
    hit: GitHubSearchHit,
    existingStats: GitHubEnrichment,
    locationId: number,
  ): Promise<void> {
    const rankFields = this.buildRankFields(existingStats, hit.followers);

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
        ...rankFields,
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
