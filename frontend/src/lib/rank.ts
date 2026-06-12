import type { DeveloperSummary, MapLocation } from '../types/api';
import { formatNumber } from './utils';

/**
 * Rank display helpers.
 *
 * - rankLevel / rankScore: absolute GitHub grade from the formula (S = best, C = worst).
 *   Lower score means a better grade. This compares you to typical GitHub medians,
 *   not just other Chilean developers.
 *
 * - percentileCl: your position within indexed Chilean devs (0 = #1 locally, 100 = last).
 *   We phrase this as "Top X% in Chile". Values below 1% keep up to two decimal places.
 */

export const RANK_SORT_LABEL = 'Rank (beta)';
export const RANK_SORT_SUMMARY_LABEL = 'rank (beta)';
export const RANK_SECTION_LABEL = 'GitHub rank (beta)';

export function hasRankData(
  developer: Pick<DeveloperSummary, 'rankLevel' | 'rankScore'>,
): boolean {
  return developer.rankLevel != null && developer.rankScore != null;
}

export function isElitePercentileChile(percentileCl: number | null): boolean {
  return percentileCl != null && percentileCl <= 1;
}

function formatDecimalPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) {
    return '0.01';
  }

  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

export function formatTopPercentChile(percentileCl: number | null): string | null {
  if (percentileCl == null) {
    return null;
  }

  if (percentileCl < 1) {
    const displayValue =
      percentileCl === 0 ? '0.01' : formatDecimalPercent(percentileCl);
    return `Top ${displayValue}% in Chile`;
  }

  return `Top ${Math.ceil(percentileCl)}% in Chile`;
}

export function formatLocationRank(
  rankLocation: number | null,
  locationName: string,
  locationKind: MapLocation['kind'],
): string | null {
  if (rankLocation == null || locationKind === 'country') {
    return null;
  }

  return `#${formatNumber(rankLocation)} in ${locationName}`;
}

export function formatCountryRank(rankCountry: number | null): string | null {
  if (rankCountry == null) {
    return null;
  }

  return `#${formatNumber(rankCountry)} in Chile`;
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
