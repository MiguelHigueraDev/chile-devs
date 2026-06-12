/**
 * GitHub-style developer grade (S → C), ported from github-readme-stats.
 *
 * How it works, without the stats jargon:
 *
 * 1. We collect six public GitHub numbers per developer: commits (last year),
 *    pull requests, issues, code reviews, total stars, and followers.
 *
 * 2. Each number is compared to a typical GitHub median (e.g. ~250 commits/year).
 *    Having more than the median pushes your score down; having less leaves it high.
 *    Stars and followers use a softer curve so a few huge values do not dominate.
 *
 * 3. Those six comparisons are blended with weights. Stars count most (weight 4),
 *    then PRs (3), commits (2), and issues/reviews/followers (1 each).
 *
 * 4. The blended result is a score from 0 to 100. Lower score = better grade.
 *    Letter grades map to score bands: S is 0–1, A+ is 1–12.5, …, C is 87.5–100.
 *
 * 5. Commits are capped at COMMITS_CAP so spammy commit bots cannot inflate rank.
 *
 * This grade is absolute (vs GitHub-wide medians), not relative to other Chilean devs.
 * See SyncService.refreshChilePercentiles() for the local comparison.
 *
 * CREDITS:
 * https://github.com/anuraghazra/github-readme-stats/blob/master/src/metrics/rank.ts
 */
export const COMMITS_CAP = 4000;

export type RankLevel =
  | 'S'
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C';

export type RankInput = {
  commits: number;
  prs: number;
  issues: number;
  reviews: number;
  stars: number;
  followers: number;
};

export type RankResult = {
  level: RankLevel;
  score: number;
};

// Activity metrics (commits, PRs, …): ramps up quickly at first, then levels off.
// Example: 250 commits (1× median) ≈ 50% of the way to "maxed out" for that metric.
function exponentialCdf(x: number): number {
  return 1 - 2 ** -x;
}

// Stars and followers: gentler curve — 50 stars (1× median) only counts ~50%,
// so one viral repo does not single-handedly decide the grade.
function logNormalCdf(x: number): number {
  return x / (1 + x);
}

export function calculateRank({
  commits,
  prs,
  issues,
  reviews,
  stars,
  followers,
}: RankInput): RankResult {
  // "Typical" GitHub values — ratio = your count ÷ median (1.0 means average).
  const COMMITS_MEDIAN = 250;
  const COMMITS_WEIGHT = 2;
  const PRS_MEDIAN = 50;
  const PRS_WEIGHT = 3;
  const ISSUES_MEDIAN = 25;
  const ISSUES_WEIGHT = 1;
  const REVIEWS_MEDIAN = 2;
  const REVIEWS_WEIGHT = 1;
  const STARS_MEDIAN = 50;
  const STARS_WEIGHT = 4;
  const FOLLOWERS_MEDIAN = 10;
  const FOLLOWERS_WEIGHT = 1;

  const TOTAL_WEIGHT =
    COMMITS_WEIGHT +
    PRS_WEIGHT +
    ISSUES_WEIGHT +
    REVIEWS_WEIGHT +
    STARS_WEIGHT +
    FOLLOWERS_WEIGHT;

  // Score bands → letter grade. S is the best (lowest scores), C is the worst.
  const THRESHOLDS = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const LEVELS: RankLevel[] = [
    'S',
    'A+',
    'A',
    'A-',
    'B+',
    'B',
    'B-',
    'C+',
    'C',
  ];

  const cappedCommits = Math.min(Math.max(commits, 0), COMMITS_CAP);

  const rank =
    1 -
    (COMMITS_WEIGHT * exponentialCdf(cappedCommits / COMMITS_MEDIAN) +
      PRS_WEIGHT * exponentialCdf(Math.max(prs, 0) / PRS_MEDIAN) +
      ISSUES_WEIGHT * exponentialCdf(Math.max(issues, 0) / ISSUES_MEDIAN) +
      REVIEWS_WEIGHT * exponentialCdf(Math.max(reviews, 0) / REVIEWS_MEDIAN) +
      STARS_WEIGHT * logNormalCdf(Math.max(stars, 0) / STARS_MEDIAN) +
      FOLLOWERS_WEIGHT *
        logNormalCdf(Math.max(followers, 0) / FOLLOWERS_MEDIAN)) /
      TOTAL_WEIGHT;

  const score = rank * 100;
  const levelIndex = THRESHOLDS.findIndex((threshold) => score <= threshold);
  const level = LEVELS[levelIndex >= 0 ? levelIndex : LEVELS.length - 1];

  return { level, score };
}
