import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  developers,
  discoveryRuns,
  locations,
  type DiscoverySource,
} from '../db/schema';
import { DeveloperWriterService } from '../developers/developer-writer.service';
import { ExcludedUsersService } from '../exclusion/excluded-users.service';
import { GithubService } from '../sync/github.service';
import {
  CandidateQueueService,
  type NewCandidate,
} from './candidate-queue.service';
import { ChileConfidenceService } from './chile-confidence.service';
import { ContributorSource } from './sources/contributor-source';
import { GraphSource } from './sources/graph-source';

const DEFAULT_MAX_CANDIDATES_PER_RUN = 2000;
const DEFAULT_EVAL_LIMIT = 300;

type SourceStats = Record<string, { discovered: number; accepted: number }>;

export type DiscoveryRunResult = {
  status: string;
  candidatesDiscovered: number;
  candidatesEvaluated: number;
  candidatesAccepted: number;
  candidatesRejected: number;
  sourceStats: SourceStats;
  dryRun: boolean;
};

/**
 * Orchestrates the candidate-discovery pipeline: runs every source to enqueue
 * candidates, then drains the queue, scores each candidate, and promotes the
 * high-confidence ones into the `developers` table.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private isRunning = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly github: GithubService,
    private readonly config: ConfigService,
    private readonly writer: DeveloperWriterService,
    private readonly excludedUsersService: ExcludedUsersService,
    private readonly queue: CandidateQueueService,
    private readonly confidence: ChileConfidenceService,
    private readonly graphSource: GraphSource,
    private readonly contributorSource: ContributorSource,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledDiscovery() {
    if (!this.hasToken()) {
      return;
    }
    await this.runDiscovery();
  }

  async runDiscovery(
    options: { dryRun?: boolean } = {},
  ): Promise<DiscoveryRunResult> {
    if (!this.hasToken()) {
      throw new Error(
        'GITHUB_TOKEN is not configured. Set it in backend/.env before discovering.',
      );
    }

    const dryRun = options.dryRun ?? false;

    if (this.isRunning) {
      this.logger.warn('Discovery already in progress, skipping.');
      return this.emptyResult('skipped', dryRun);
    }

    this.isRunning = true;

    const [run] = await this.db
      .insert(discoveryRuns)
      .values({ status: 'running', dryRun: dryRun ? 1 : 0 })
      .returning();

    const sourceStats: SourceStats = {};
    let candidatesDiscovered = 0;
    let candidatesEvaluated = 0;
    let candidatesAccepted = 0;
    let candidatesRejected = 0;

    try {
      const enqueued = await this.gatherAndEnqueue(sourceStats);
      candidatesDiscovered = enqueued;

      const evaluation = await this.evaluatePending(dryRun, sourceStats);
      candidatesEvaluated = evaluation.evaluated;
      candidatesAccepted = evaluation.accepted;
      candidatesRejected = evaluation.rejected;

      await this.db
        .update(discoveryRuns)
        .set({
          finishedAt: new Date(),
          candidatesDiscovered,
          candidatesEvaluated,
          candidatesAccepted,
          candidatesRejected,
          sourceStats,
          status: 'completed',
        })
        .where(eq(discoveryRuns.id, run.id));

      this.logger.log(
        `Discovery ${dryRun ? '(dry-run) ' : ''}completed. ${candidatesDiscovered} discovered, ${candidatesEvaluated} evaluated, ${candidatesAccepted} accepted, ${candidatesRejected} rejected.`,
      );

      return {
        status: 'completed',
        candidatesDiscovered,
        candidatesEvaluated,
        candidatesAccepted,
        candidatesRejected,
        sourceStats,
        dryRun,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown discovery error';

      await this.db
        .update(discoveryRuns)
        .set({
          finishedAt: new Date(),
          candidatesDiscovered,
          candidatesEvaluated,
          candidatesAccepted,
          candidatesRejected,
          sourceStats,
          status: 'failed',
          errorMessage: message,
        })
        .where(eq(discoveryRuns.id, run.id));

      this.logger.error(`Discovery failed: ${message}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async getLastDiscoveryRun() {
    const runs = await this.db
      .select()
      .from(discoveryRuns)
      .orderBy(desc(discoveryRuns.id))
      .limit(1);
    return runs[0] ?? null;
  }

  // Runs each source, dedups against existing developers / excluded / queued
  // users, and enqueues the rest. Returns the number of newly enqueued candidates.
  private async gatherAndEnqueue(sourceStats: SourceStats): Promise<number> {
    const [graphCandidates, contributorCandidates] = await Promise.all([
      this.safeCollect('graph', () => this.graphSource.collect()),
      this.safeCollect('contributor', () => this.contributorSource.collect()),
    ]);

    const merged = this.mergeCandidates([
      ...graphCandidates,
      ...contributorCandidates,
    ]);

    const mergedGithubIds = merged.map((candidate) => candidate.githubId);
    const excluded = await this.excludedUsersService.loadExcludedGithubIds();
    const known = await this.queue.loadKnownGithubIds(mergedGithubIds);
    const existingDevs = await this.loadExistingDeveloperIds(mergedGithubIds);

    const fresh = merged.filter(
      (candidate) =>
        !excluded.has(candidate.githubId) &&
        !known.has(candidate.githubId) &&
        !existingDevs.has(candidate.githubId),
    );

    const maxPerRun = this.num(
      'DISCOVERY_MAX_CANDIDATES_PER_RUN',
      DEFAULT_MAX_CANDIDATES_PER_RUN,
    );
    const capped = fresh.slice(0, maxPerRun);

    await this.queue.enqueueMany(capped);

    for (const candidate of capped) {
      this.bumpStat(sourceStats, candidate.source, 'discovered');
    }

    this.logger.log(
      `Sources produced ${merged.length} unique candidates; ${capped.length} new after dedup.`,
    );

    return capped.length;
  }

  private async evaluatePending(
    dryRun: boolean,
    sourceStats: SourceStats,
  ): Promise<{ evaluated: number; accepted: number; rejected: number }> {
    const evalLimit = this.num('DISCOVERY_EVAL_LIMIT', DEFAULT_EVAL_LIMIT);
    const pending = await this.queue.loadPending(evalLimit);
    if (pending.length === 0) {
      return { evaluated: 0, accepted: 0, rejected: 0 };
    }

    const excluded = await this.excludedUsersService.loadExcludedGithubIds();
    const allLocations = await this.db.select().from(locations);
    const profiles = await this.github.fetchProfiles(
      pending.map((candidate) => candidate.login),
    );

    let evaluated = 0;
    let accepted = 0;
    let rejected = 0;

    // login -> { candidate source, profile } for accepted candidates we still
    // need to enrich + upsert.
    const toPromote: Array<{
      login: string;
      source: DiscoverySource;
      githubId: string;
    }> = [];

    for (const candidate of pending) {
      evaluated += 1;

      if (excluded.has(candidate.githubId)) {
        await this.queue.markStatus([candidate.githubId], 'excluded');
        continue;
      }

      const profile = profiles.get(candidate.login);
      if (!profile) {
        // User deleted/renamed or not visible — give up on this candidate.
        await this.queue.recordEvaluation(candidate.githubId, {
          rawLocation: candidate.rawLocation,
          bio: candidate.bio,
          company: candidate.company,
          blog: candidate.blog,
          confidence: 0,
          reasons: ['profile:unavailable'],
          neighborOverlap: candidate.signals.neighborOverlap ?? 0,
          status: 'rejected',
        });
        rejected += 1;
        continue;
      }

      const neighborOverlap = candidate.signals.neighborOverlap ?? 0;
      const result = this.confidence.score({
        login: profile.login,
        rawLocation: profile.rawLocation,
        bio: profile.bio,
        company: profile.company,
        blog: profile.blog,
        source: candidate.source,
        discoveredVia: candidate.discoveredVia,
        neighborOverlap,
      });

      // Keep accepted candidates `pending` until promotion actually succeeds so
      // a failed promote() leaves them retryable instead of stuck non-pending.
      const persistedStatus =
        !dryRun && result.verdict === 'accepted' ? 'pending' : result.verdict;
      await this.queue.recordEvaluation(candidate.githubId, {
        rawLocation: profile.rawLocation,
        bio: profile.bio,
        company: profile.company,
        blog: profile.blog,
        confidence: result.confidence,
        reasons: result.reasons,
        neighborOverlap,
        status: persistedStatus,
      });

      if (result.verdict === 'accepted') {
        accepted += 1;
        this.bumpStat(sourceStats, candidate.source, 'accepted');
        if (!dryRun) {
          toPromote.push({
            login: profile.login,
            source: candidate.source,
            githubId: candidate.githubId,
          });
        }
      } else if (result.verdict === 'rejected') {
        rejected += 1;
      }
    }

    if (toPromote.length > 0) {
      await this.promote(toPromote, profiles, allLocations);
    }

    return { evaluated, accepted, rejected };
  }

  private async promote(
    toPromote: Array<{
      login: string;
      source: DiscoverySource;
      githubId: string;
    }>,
    profiles: Awaited<ReturnType<GithubService['fetchProfiles']>>,
    allLocations: (typeof locations.$inferSelect)[],
  ): Promise<void> {
    const logins = toPromote.map((item) => item.login);
    const enrichment = await this.github.enrichUsers(logins);

    let upserted = 0;
    const promoted: string[] = [];

    for (const item of toPromote) {
      const profile = profiles.get(item.login);
      if (!profile) {
        continue;
      }

      const stats = enrichment.get(item.login);
      if (!stats) {
        // Enrichment failed; leave pending so a later run can retry instead of
        // silently dropping a confidently-Chilean developer.
        this.logger.warn(
          `Enrichment missing for accepted candidate @${item.login}, re-queuing`,
        );
        continue;
      }

      const classified = this.github.classifyLocation(
        profile.rawLocation,
        allLocations,
      );
      await this.writer.upsertDeveloper(profile, stats, classified.id);
      promoted.push(item.githubId);
      upserted += 1;
      this.logger.log(
        `Promoted @${item.login} via ${item.source} (location: ${classified.slug}, raw: ${profile.rawLocation ?? 'none'})`,
      );
    }

    // Flip to `accepted` only after the developer row is committed; until now
    // these stayed `pending` so any failure above keeps them retryable.
    if (promoted.length > 0) {
      await this.queue.markStatus(promoted, 'accepted');
    }

    if (upserted > 0) {
      await this.writer.refreshRankings();
    }
  }

  private mergeCandidates(candidates: NewCandidate[]): NewCandidate[] {
    const byId = new Map<string, NewCandidate>();
    for (const candidate of candidates) {
      const existing = byId.get(candidate.githubId);
      if (!existing) {
        byId.set(candidate.githubId, { ...candidate });
        continue;
      }

      // Keep the strongest neighbor-overlap signal; prefer a graph source label
      // over a contributor one since graph overlap is the richer signal.
      existing.neighborOverlap = Math.max(
        existing.neighborOverlap ?? 0,
        candidate.neighborOverlap ?? 0,
      );
      if (
        existing.source === 'org_contributor' ||
        existing.source === 'repo_contributor'
      ) {
        if (
          candidate.source === 'follower_graph' ||
          candidate.source === 'following_graph'
        ) {
          existing.source = candidate.source;
          existing.discoveredVia = candidate.discoveredVia;
        }
      }
    }
    return [...byId.values()];
  }

  private async loadExistingDeveloperIds(
    githubIds: string[],
  ): Promise<Set<string>> {
    if (githubIds.length === 0) {
      return new Set();
    }

    const rows = await this.db
      .select({ githubId: developers.githubId })
      .from(developers)
      .where(inArray(developers.githubId, githubIds));
    return new Set(rows.map((row) => row.githubId));
  }

  private async safeCollect(
    label: string,
    collect: () => Promise<NewCandidate[]>,
  ): Promise<NewCandidate[]> {
    try {
      return await collect();
    } catch (error) {
      this.logger.warn(
        `Source "${label}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private bumpStat(
    stats: SourceStats,
    source: DiscoverySource,
    key: 'discovered' | 'accepted',
  ): void {
    const entry = (stats[source] ??= { discovered: 0, accepted: 0 });
    entry[key] += 1;
  }

  private hasToken(): boolean {
    const token = this.config.get<string>('GITHUB_TOKEN', '');
    return !!token && !token.includes('your_personal_access_token');
  }

  private num(key: string, fallback: number): number {
    const raw = Number(this.config.get<string>(key, String(fallback)));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  }

  private emptyResult(status: string, dryRun: boolean): DiscoveryRunResult {
    return {
      status,
      candidatesDiscovered: 0,
      candidatesEvaluated: 0,
      candidatesAccepted: 0,
      candidatesRejected: 0,
      sourceStats: {},
      dryRun,
    };
  }
}
