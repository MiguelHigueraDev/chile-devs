export type LocationKind = 'country' | 'region' | 'city';

export type PoolDev = {
  githubId: string;
  login: string;
  locationId: number;
  locationSlug: string;
  locationKind: LocationKind;
  totalStars: number;
  regionLocationId: number | null;
};

export type FlatRepo = {
  repoGithubId: string;
  ownerGithubId: string;
  locationId: number;
  regionLocationId: number | null;
  nameWithOwner: string;
  name: string;
  description: string | null;
  url: string;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
};

export type SelectedRepo = FlatRepo & {
  regionRank: number | null;
  countryRank: number | null;
};

export function computeResetThreshold(
  totalDeveloperCount: number,
  rotationFraction: number,
): number {
  return Math.floor(totalDeveloperCount * rotationFraction);
}

export function shouldResetExploredDevs(
  exploredCount: number,
  totalDeveloperCount: number,
  rotationFraction: number,
): boolean {
  const threshold = computeResetThreshold(
    totalDeveloperCount,
    rotationFraction,
  );
  return threshold > 0 && exploredCount >= threshold;
}

export function getRegionPromotedCount(
  regionLocationId: number | null,
  regionPromotedCount: Map<number, number>,
): number {
  if (regionLocationId == null) {
    return 0;
  }
  return regionPromotedCount.get(regionLocationId) ?? 0;
}

function compareDevsByRegionPriority(
  a: PoolDev,
  b: PoolDev,
  regionPromotedCount: Map<number, number>,
): number {
  const aPromoted = getRegionPromotedCount(
    a.regionLocationId,
    regionPromotedCount,
  );
  const bPromoted = getRegionPromotedCount(
    b.regionLocationId,
    regionPromotedCount,
  );
  if (aPromoted !== bPromoted) {
    return aPromoted - bPromoted;
  }
  if (b.totalStars !== a.totalStars) {
    return b.totalStars - a.totalStars;
  }
  return a.githubId.localeCompare(b.githubId);
}

function compareDevsByStars(a: PoolDev, b: PoolDev): number {
  if (b.totalStars !== a.totalStars) {
    return b.totalStars - a.totalStars;
  }
  return a.githubId.localeCompare(b.githubId);
}

function compareReposByStars(a: FlatRepo, b: FlatRepo): number {
  if (b.stars !== a.stars) {
    return b.stars - a.stars;
  }
  return a.repoGithubId.localeCompare(b.repoGithubId);
}

export function selectDevsForBatch(input: {
  pool: PoolDev[];
  exclusionGithubIds: Set<string>;
  regionPromotedCount: Map<number, number>;
  batchSize: number;
  regionCount: number;
}): PoolDev[] {
  const {
    pool,
    exclusionGithubIds,
    regionPromotedCount,
    batchSize,
    regionCount,
  } = input;

  if (batchSize <= 0) {
    return [];
  }

  const eligible = pool.filter((dev) => !exclusionGithubIds.has(dev.githubId));
  const perRegionCap = Math.max(
    1,
    Math.ceil(batchSize / Math.max(regionCount, 1)),
  );

  const selected: PoolDev[] = [];
  const selectedIds = new Set<string>();
  const regionPickCount = new Map<number, number>();

  const pass1Sorted = [...eligible].sort((a, b) =>
    compareDevsByRegionPriority(a, b, regionPromotedCount),
  );

  for (const dev of pass1Sorted) {
    if (selected.length >= batchSize) {
      break;
    }

    const regionKey = dev.regionLocationId ?? 0;
    const picksInRegion = regionPickCount.get(regionKey) ?? 0;
    if (picksInRegion >= perRegionCap) {
      continue;
    }

    selected.push(dev);
    selectedIds.add(dev.githubId);
    regionPickCount.set(regionKey, picksInRegion + 1);
  }

  const pass2Sorted = eligible
    .filter((dev) => !selectedIds.has(dev.githubId))
    .sort(compareDevsByStars);

  for (const dev of pass2Sorted) {
    if (selected.length >= batchSize) {
      break;
    }
    selected.push(dev);
  }

  return selected;
}

export function rankReposWithRegionBias(
  repos: FlatRepo[],
  perRegion: number,
  perCountry: number,
  regionPromotedCount: Map<number, number>,
): Map<string, SelectedRepo> {
  const selected = new Map<string, SelectedRepo>();

  const byRegion = new Map<number, FlatRepo[]>();
  for (const repo of repos) {
    if (repo.regionLocationId == null) {
      continue;
    }
    const list = byRegion.get(repo.regionLocationId) ?? [];
    list.push(repo);
    byRegion.set(repo.regionLocationId, list);
  }

  const regionIds = [...byRegion.keys()].sort((a, b) => {
    const aPromoted = getRegionPromotedCount(a, regionPromotedCount);
    const bPromoted = getRegionPromotedCount(b, regionPromotedCount);
    if (aPromoted !== bPromoted) {
      return aPromoted - bPromoted;
    }
    return a - b;
  });

  for (const regionId of regionIds) {
    const regionRepos = byRegion.get(regionId) ?? [];
    regionRepos.sort(compareReposByStars);

    regionRepos.slice(0, perRegion).forEach((repo, index) => {
      selected.set(repo.repoGithubId, {
        ...repo,
        regionRank: index + 1,
        countryRank: null,
      });
    });
  }

  const countrySorted = [...repos].sort((a, b) => {
    const aPromoted = getRegionPromotedCount(
      a.regionLocationId,
      regionPromotedCount,
    );
    const bPromoted = getRegionPromotedCount(
      b.regionLocationId,
      regionPromotedCount,
    );
    if (aPromoted !== bPromoted) {
      return aPromoted - bPromoted;
    }
    return compareReposByStars(a, b);
  });

  countrySorted.slice(0, perCountry).forEach((repo, index) => {
    const existing = selected.get(repo.repoGithubId);
    if (existing) {
      existing.countryRank = index + 1;
    } else {
      selected.set(repo.repoGithubId, {
        ...repo,
        regionRank: null,
        countryRank: index + 1,
      });
    }
  });

  return selected;
}
