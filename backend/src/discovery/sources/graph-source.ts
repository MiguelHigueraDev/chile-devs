import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/db.module';
import { developers } from '../../db/schema';
import {
  GithubService,
  type GitHubNeighbor,
  type NeighborDirection,
} from '../../sync/github.service';
import type { NewCandidate } from '../candidate-queue.service';
import { parsePositiveIntOrFallback } from '../utils';

const DEFAULT_SEEDS_PER_RUN = 25;
const DEFAULT_NEIGHBOR_PAGES_PER_SEED = 2;
const DEFAULT_SEED_RECRAWL_DAYS = 30;

type AggregatedNeighbor = {
  login: string;
  direction: NeighborDirection;
  seeds: Set<string>;
};

/**
 * Social-graph snowball: expands the followers/following of already-verified
 * Chilean developers. The intuition is that Chilean devs disproportionately
 * follow each other, so their graph neighborhood is dense with more Chilean devs.
 */
@Injectable()
export class GraphSource {
  private readonly logger = new Logger(GraphSource.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly github: GithubService,
    private readonly config: ConfigService,
  ) {}

  async collect(): Promise<NewCandidate[]> {
    const seedsPerRun = parsePositiveIntOrFallback(
      this.config,
      'DISCOVERY_GRAPH_SEEDS_PER_RUN',
      DEFAULT_SEEDS_PER_RUN,
    );
    const neighborPages = parsePositiveIntOrFallback(
      this.config,
      'DISCOVERY_NEIGHBOR_PAGES_PER_SEED',
      DEFAULT_NEIGHBOR_PAGES_PER_SEED,
    );
    const recrawlDays = parsePositiveIntOrFallback(
      this.config,
      'DISCOVERY_SEED_RECRAWL_DAYS',
      DEFAULT_SEED_RECRAWL_DAYS,
    );

    const seeds = await this.selectSeeds(seedsPerRun, recrawlDays);
    if (seeds.length === 0) {
      this.logger.log('No graph seeds available this run.');
      return [];
    }

    this.logger.log(
      `Expanding social graph from ${seeds.length} verified seeds.`,
    );

    const aggregated = new Map<string, AggregatedNeighbor>();
    const seedGithubIds: string[] = [];

    for (const seed of seeds) {
      seedGithubIds.push(seed.githubId);

      for (const direction of ['followers', 'following'] as const) {
        let neighbors: GitHubNeighbor[] = [];
        try {
          neighbors = await this.github.fetchNeighbors(
            seed.login,
            direction,
            neighborPages,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to fetch ${direction} of @${seed.login}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }

        for (const neighbor of neighbors) {
          const existing = aggregated.get(neighbor.githubId);
          if (existing) {
            existing.seeds.add(seed.githubId);
          } else {
            aggregated.set(neighbor.githubId, {
              login: neighbor.login,
              direction,
              seeds: new Set([seed.githubId]),
            });
          }
        }
      }
    }

    await this.markSeedsCrawled(seedGithubIds);

    const candidates: NewCandidate[] = [];
    for (const [githubId, neighbor] of aggregated) {
      candidates.push({
        githubId,
        login: neighbor.login,
        source:
          neighbor.direction === 'followers'
            ? 'follower_graph'
            : 'following_graph',
        discoveredVia: 'graph',
        neighborOverlap: neighbor.seeds.size,
      });
    }

    return candidates;
  }

  private async selectSeeds(
    limit: number,
    recrawlDays: number,
  ): Promise<Array<{ githubId: string; login: string }>> {
    const cutoff = new Date(Date.now() - recrawlDays * 24 * 60 * 60 * 1000);

    return this.db
      .select({ githubId: developers.githubId, login: developers.login })
      .from(developers)
      .where(
        or(
          isNull(developers.lastGraphCrawlAt),
          lt(developers.lastGraphCrawlAt, cutoff),
        ),
      )
      .orderBy(
        sql`${developers.lastGraphCrawlAt} asc nulls first`,
        desc(developers.followers),
      )
      .limit(limit);
  }

  private async markSeedsCrawled(githubIds: string[]): Promise<void> {
    if (githubIds.length === 0) {
      return;
    }

    await this.db
      .update(developers)
      .set({ lastGraphCrawlAt: new Date() })
      .where(inArray(developers.githubId, githubIds));
  }
}
