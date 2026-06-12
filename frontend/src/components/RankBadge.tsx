import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import {
  clampRankScore,
  formatTopPercentChile,
  hasRankData,
  isElitePercentileChile,
  RANK_LEVEL_RING_COLORS,
  rankRingFillPercent,
} from '../lib/rank';
import type { DeveloperSummary } from '../types/api';

type RankBadgeProps = {
  developer: Pick<
    DeveloperSummary,
    'rankLevel' | 'rankScore' | 'percentileCl'
  >;
  showPercentile?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  centered?: boolean;
  className?: string;
};

const SIZE_CONFIG = {
  xs: {
    ring: 'size-5',
    letter: 'text-[8px]',
    twoCharLetter: 'text-[7px]',
  },
  sm: {
    ring: 'size-8',
    letter: 'text-[10px]',
    twoCharLetter: 'text-[9px]',
  },
  md: {
    ring: 'size-14',
    letter: 'text-sm',
    twoCharLetter: 'text-xs',
  },
  lg: {
    ring: 'size-28',
    letter: 'text-2xl',
    twoCharLetter: 'text-xl',
  },
} as const;

export function RankBadge({
  developer,
  showPercentile = false,
  size = 'md',
  centered = false,
  className,
}: RankBadgeProps) {
  if (!hasRankData(developer) || !developer.rankLevel) {
    return null;
  }

  const score = clampRankScore(developer.rankScore ?? 0);
  const ringFill = rankRingFillPercent(score);
  const ringColor =
    RANK_LEVEL_RING_COLORS[developer.rankLevel] ?? 'text-muted-foreground';
  const topPercent = showPercentile
    ? formatTopPercentChile(developer.percentileCl)
    : null;
  const showEliteStar =
    showPercentile && isElitePercentileChile(developer.percentileCl);
  const sizeConfig = SIZE_CONFIG[size];
  const letterClass =
    developer.rankLevel.length > 1
      ? sizeConfig.twoCharLetter
      : sizeConfig.letter;

  return (
    <div
      className={cn(
        centered
          ? 'flex flex-col items-center gap-2 text-center'
          : 'inline-flex items-center gap-2',
        className,
      )}
    >
      <div
        className={cn('relative shrink-0', sizeConfig.ring)}
        role="img"
        aria-label={`Rank ${developer.rankLevel}, score ${score.toFixed(1)} out of 100`}
      >
        <svg
          viewBox="0 0 36 36"
          className="size-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-border/80"
          />
          <circle
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${ringFill} 100`}
            className={ringColor}
          />
        </svg>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-bold tabular-nums',
            letterClass,
            ringColor,
          )}
        >
          {developer.rankLevel}
        </span>
      </div>
      {topPercent && (
        <Badge
          variant="secondary"
          className="inline-flex items-center gap-1 text-xs font-medium tabular-nums"
        >
          {showEliteStar && (
            <Star
              className="size-3 shrink-0 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
          )}
          {topPercent}
        </Badge>
      )}
    </div>
  );
}
