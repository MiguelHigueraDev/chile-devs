export const CANDIDATE_STATUSES = ['candidate', 'promoted', 'rejected'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_SCOPES = ['region', 'country'] as const;
export type CandidateScope = (typeof CANDIDATE_SCOPES)[number];

export const CANDIDATE_SORT_KEYS = [
  'stars',
  'regionRank',
  'countryRank',
] as const;
export type CandidateSortKey = (typeof CANDIDATE_SORT_KEYS)[number];

export type RefreshCandidatesInput = {
  perRegion?: number;
  perCountry?: number;
};

export type RefreshCandidatesSummary = {
  perRegion: number;
  perCountry: number;
  regionPicks: number;
  countryPicks: number;
  totalSelected: number;
  totalCandidates: number;
  promotedRetained: number;
  rejectedRetained: number;
};

export type ListCandidatesInput = {
  status?: CandidateStatus;
  regionSlug?: string;
  scope?: CandidateScope;
  sort?: CandidateSortKey;
  limit?: number;
  offset?: number;
};

export function parseCandidateStatus(
  value?: string,
): CandidateStatus | undefined {
  return CANDIDATE_STATUSES.includes(value as CandidateStatus)
    ? (value as CandidateStatus)
    : undefined;
}

export function parseCandidateScope(value?: string): CandidateScope | undefined {
  return CANDIDATE_SCOPES.includes(value as CandidateScope)
    ? (value as CandidateScope)
    : undefined;
}

export function parseCandidateSort(value?: string): CandidateSortKey {
  return CANDIDATE_SORT_KEYS.includes(value as CandidateSortKey)
    ? (value as CandidateSortKey)
    : 'stars';
}
