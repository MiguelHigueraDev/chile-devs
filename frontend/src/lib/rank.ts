import type { DeveloperSummary } from '../types/api';

/**
 * Rank display helpers.
 *
 * - rankLevel / rankScore: absolute GitHub grade from the formula (S = best, C = worst).
 *   Lower score means a better grade. This compares you to typical GitHub medians,
 *   not just other Chilean developers.
 *
 * - percentileCl: your position within indexed Chilean devs (0 = #1 locally, 100 = last).
 *   We phrase this as "Top X% in Chile" so #1 reads as "Top 1%", not "0%".
 */

export const RANK_SORT_LABEL = 'Rank (beta)';
export const RANK_SORT_SUMMARY_LABEL = 'rank (beta)';
export const RANK_SECTION_LABEL = 'GitHub rank (beta)';
export const RANK_CALCULATING_MESSAGE =
  'Rank is still being calculated for all devs. Check again later for final results';

export function hasRankData(
  developer: Pick<DeveloperSummary, 'rankLevel' | 'rankScore'>,
): boolean {
  return developer.rankLevel != null && developer.rankScore != null;
}

export function formatTopPercentChile(percentileCl: number | null): string | null {
  if (percentileCl == null) {
    return null;
  }

  // percentileCl is 0 for the best dev in Chile; round up so #1 shows "Top 1%".
  const topPercent = Math.max(1, Math.ceil(percentileCl));
  return `Top ${topPercent}% in Chile`;
}

export const RANK_LEVEL_RING_COLORS: Record<string, string> = {
  S: 'text-violet-500',
  'A+': 'text-emerald-500',
  A: 'text-emerald-500',
  'A-': 'text-lime-500',
  'B+': 'text-sky-500',
  B: 'text-sky-500',
  'B-': 'text-amber-500',
  'C+': 'text-orange-500',
  C: 'text-orange-500',
};

export function clampRankScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

// rankScore is lower-is-better; the ring is inverted so more fill = better grade.
export function rankRingFillPercent(score: number): number {
  return 100 - clampRankScore(score);
}
