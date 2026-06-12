import { calculateRank, COMMITS_CAP } from './rank';

describe('calculateRank', () => {
  it('returns the lowest grade for empty metrics', () => {
    const result = calculateRank({
      commits: 0,
      prs: 0,
      issues: 0,
      reviews: 0,
      stars: 0,
      followers: 0,
    });

    expect(result.level).toBe('C');
    expect(result.score).toBe(100);
  });

  it('caps commits at 4000 before scoring', () => {
    const capped = calculateRank({
      commits: COMMITS_CAP,
      prs: 0,
      issues: 0,
      reviews: 0,
      stars: 0,
      followers: 0,
    });
    const uncapped = calculateRank({
      commits: COMMITS_CAP + 10_000,
      prs: 0,
      issues: 0,
      reviews: 0,
      stars: 0,
      followers: 0,
    });

    expect(capped.score).toBe(uncapped.score);
  });

  it('lowers the score as activity increases', () => {
    const low = calculateRank({
      commits: 10,
      prs: 1,
      issues: 0,
      reviews: 0,
      stars: 5,
      followers: 2,
    });
    const high = calculateRank({
      commits: 2000,
      prs: 200,
      issues: 100,
      reviews: 50,
      stars: 500,
      followers: 100,
    });

    expect(low.score).toBeGreaterThan(high.score);
    expect(high.level).not.toBe('S');
  });

  it('weights stars heavily in the composite score', () => {
    const withStars = calculateRank({
      commits: 0,
      prs: 0,
      issues: 0,
      reviews: 0,
      stars: 500,
      followers: 0,
    });
    const withoutStars = calculateRank({
      commits: 0,
      prs: 0,
      issues: 0,
      reviews: 0,
      stars: 0,
      followers: 0,
    });

    expect(withStars.score).toBeLessThan(withoutStars.score);
  });
});
