import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  discoveryCandidates,
  type CandidateStatus,
  type DiscoveryCandidate,
  type DiscoverySource,
} from '../db/schema';

export type NewCandidate = {
  githubId: string;
  login: string;
  source: DiscoverySource;
  discoveredVia: string | null;
  neighborOverlap?: number;
};

export type CandidateEvaluation = {
  rawLocation: string | null;
  bio: string | null;
  company: string | null;
  blog: string | null;
  confidence: number;
  reasons: string[];
  neighborOverlap: number;
  status: CandidateStatus;
};

/**
 * Persistent queue of discovered-but-unverified GitHub users. Sources enqueue
 * candidates here; the discovery orchestrator drains pending rows, scores them,
 * and promotes accepted ones into the `developers` table.
 */
@Injectable()
export class CandidateQueueService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** All github ids already in the queue (any status), for dedup before enqueue. */
  async loadKnownGithubIds(): Promise<Set<string>> {
    const rows = await this.db
      .select({ githubId: discoveryCandidates.githubId })
      .from(discoveryCandidates);
    return new Set(rows.map((row) => row.githubId));
  }

  /**
   * Insert new candidates, skipping any that already exist (by github id).
   * Returns the number of rows actually inserted.
   */
  async enqueueMany(candidates: NewCandidate[]): Promise<number> {
    if (candidates.length === 0) {
      return 0;
    }

    const rows = candidates.map((candidate) => ({
      githubId: candidate.githubId,
      login: candidate.login,
      source: candidate.source,
      discoveredVia: candidate.discoveredVia,
      signals: { reasons: [], neighborOverlap: candidate.neighborOverlap ?? 0 },
    }));

    const inserted = await this.db
      .insert(discoveryCandidates)
      .values(rows)
      .onConflictDoNothing({ target: discoveryCandidates.githubId })
      .returning({ githubId: discoveryCandidates.githubId });

    return inserted.length;
  }

  async loadPending(limit: number): Promise<DiscoveryCandidate[]> {
    return this.db
      .select()
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.status, 'pending'))
      .orderBy(asc(discoveryCandidates.createdAt))
      .limit(limit);
  }

  async recordEvaluation(
    githubId: string,
    evaluation: CandidateEvaluation,
  ): Promise<void> {
    await this.db
      .update(discoveryCandidates)
      .set({
        rawLocation: evaluation.rawLocation,
        bio: evaluation.bio,
        company: evaluation.company,
        blog: evaluation.blog,
        confidence: evaluation.confidence,
        signals: {
          reasons: evaluation.reasons,
          neighborOverlap: evaluation.neighborOverlap,
        },
        status: evaluation.status,
        lastEvaluatedAt: new Date(),
      })
      .where(eq(discoveryCandidates.githubId, githubId));
  }

  async markStatus(
    githubIds: string[],
    status: CandidateStatus,
  ): Promise<void> {
    if (githubIds.length === 0) {
      return;
    }

    await this.db
      .update(discoveryCandidates)
      .set({ status })
      .where(inArray(discoveryCandidates.githubId, githubIds));
  }
}
