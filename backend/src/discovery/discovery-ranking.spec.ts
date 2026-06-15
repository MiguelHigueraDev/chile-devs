import {
  type FlatRepo,
  type PoolDev,
  computeResetThreshold,
  rankReposWithRegionBias,
  selectDevsForBatch,
  shouldResetExploredDevs,
} from './discovery-ranking';

function makeDev(
  id: string,
  regionLocationId: number | null,
  totalStars: number,
): PoolDev {
  return {
    githubId: id,
    login: `user-${id}`,
    locationId: 1,
    locationSlug: 'santiago',
    locationKind: 'city',
    totalStars,
    regionLocationId,
  };
}

function makeRepo(
  id: string,
  regionLocationId: number | null,
  stars: number,
): FlatRepo {
  return {
    repoGithubId: id,
    ownerGithubId: `owner-${id}`,
    locationId: 1,
    regionLocationId,
    nameWithOwner: `owner-${id}/repo-${id}`,
    name: `repo-${id}`,
    description: null,
    url: `https://github.com/owner-${id}/repo-${id}`,
    primaryLanguage: 'TypeScript',
    stars,
    forks: 0,
  };
}

describe('discovery rotation helpers', () => {
  it('computes reset threshold from full developer pool', () => {
    expect(computeResetThreshold(43911, 0.2)).toBe(8782);
  });

  it('resets explored devs when threshold is reached', () => {
    expect(shouldResetExploredDevs(8782, 43911, 0.2)).toBe(true);
    expect(shouldResetExploredDevs(8781, 43911, 0.2)).toBe(false);
  });
});

describe('selectDevsForBatch', () => {
  const regionPromotedCount = new Map<number, number>([
    [1, 20],
    [2, 1],
  ]);

  it('excludes devs in the exclusion set', () => {
    const pool = [makeDev('a', 1, 100), makeDev('b', 2, 90)];
    const selected = selectDevsForBatch({
      pool,
      exclusionGithubIds: new Set(['a']),
      regionPromotedCount,
      batchSize: 2,
      regionCount: 2,
    });

    expect(selected.map((dev) => dev.githubId)).toEqual(['b']);
  });

  it('deprioritizes devs with unknown region in pass 1', () => {
    const pool = [makeDev('unknown', null, 500), makeDev('under', 2, 100)];

    const selected = selectDevsForBatch({
      pool,
      exclusionGithubIds: new Set(),
      regionPromotedCount,
      batchSize: 1,
      regionCount: 2,
    });

    expect(selected.map((dev) => dev.githubId)).toEqual(['under']);
  });

  it('favors devs from regions with fewer promoted repos in pass 1', () => {
    const pool = [
      makeDev('popular', 1, 500),
      makeDev('under', 2, 100),
      makeDev('under-2', 2, 90),
    ];

    const selected = selectDevsForBatch({
      pool,
      exclusionGithubIds: new Set(),
      regionPromotedCount,
      batchSize: 1,
      regionCount: 2,
    });

    expect(selected.map((dev) => dev.githubId)).toEqual(['under']);
  });

  it('spreads pass 1 picks across regions with a per-region cap', () => {
    const pool = [
      makeDev('popular', 1, 500),
      makeDev('under', 2, 100),
      makeDev('under-2', 2, 90),
    ];

    const selected = selectDevsForBatch({
      pool,
      exclusionGithubIds: new Set(),
      regionPromotedCount,
      batchSize: 2,
      regionCount: 2,
    });

    expect(selected.map((dev) => dev.githubId)).toEqual(['under', 'popular']);
  });

  it('backfills from popular regions when pass 1 cannot fill the batch', () => {
    const pool = [
      makeDev('under', 2, 100),
      makeDev('popular-1', 1, 500),
      makeDev('popular-2', 1, 400),
    ];

    const selected = selectDevsForBatch({
      pool,
      exclusionGithubIds: new Set(),
      regionPromotedCount,
      batchSize: 3,
      regionCount: 2,
    });

    expect(selected.map((dev) => dev.githubId)).toEqual([
      'under',
      'popular-1',
      'popular-2',
    ]);
  });
});

describe('rankReposWithRegionBias', () => {
  const regionPromotedCount = new Map<number, number>([
    [1, 20],
    [2, 1],
  ]);

  it('prioritizes low-promoted regions for regional picks', () => {
    const repos = [
      makeRepo('r1-high', 1, 500),
      makeRepo('r2-low', 2, 100),
      makeRepo('r2-mid', 2, 80),
    ];

    const selected = rankReposWithRegionBias(repos, 1, 2, regionPromotedCount);
    const regional = [...selected.values()]
      .filter((repo) => repo.regionRank != null)
      .sort((a, b) => (a.regionRank ?? 0) - (b.regionRank ?? 0));

    expect(regional[0]?.repoGithubId).toBe('r2-low');
  });

  it('prioritizes low-promoted regions for country picks', () => {
    const repos = [
      makeRepo('r1-high', 1, 500),
      makeRepo('r2-low', 2, 100),
      makeRepo('r1-mid', 1, 400),
    ];

    const selected = rankReposWithRegionBias(repos, 0, 2, regionPromotedCount);
    const country = [...selected.values()]
      .filter((repo) => repo.countryRank != null)
      .sort((a, b) => (a.countryRank ?? 0) - (b.countryRank ?? 0));

    expect(country.map((repo) => repo.repoGithubId)).toEqual([
      'r2-low',
      'r1-high',
    ]);
  });
});
