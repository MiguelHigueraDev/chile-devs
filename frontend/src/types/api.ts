export type MapLocation = {
  slug: string;
  name: string;
  kind: 'country' | 'region' | 'city';
  lat: number;
  lng: number;
  devCount: number;
  totalContributions: number;
};

export type DeveloperSortKey = 'contributions' | 'followers' | 'stars' | 'rank';

export const DEFAULT_DEVELOPER_SORT: DeveloperSortKey = 'rank';

export type SearchSortKey = DeveloperSortKey | 'languageShare';

export type TopLanguage = {
  name: string;
  share: number;
};

export type DeveloperSummary = {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributions: number;
  followers: number;
  totalStars: number;
  topLanguages: TopLanguage[];
  rankLevel: string | null;
  rankScore: number | null;
  percentileCl: number | null;
  rankLocation: number | null;
  rankCountry: number | null;
  profileUrl: string;
  rawLocation: string | null;
};

export type DeveloperDetail = DeveloperSummary & {
  locationName: string;
  locationKind: MapLocation['kind'];
  portfolioUrl: string | null;
  description: string | null;
  role: string | null;
  claimed: boolean;
};

export type MeResponse = {
  login: string;
  avatarUrl: string | null;
  hasProfile: boolean;
  isExcluded: boolean;
};

export type UpdateProfileInput = {
  portfolioUrl?: string | null;
  description?: string | null;
  role?: string | null;
};

export type LocationDevelopersResponse = {
  location?: {
    slug: string;
    name: string;
    kind: string;
    lat: number;
    lng: number;
  };
  devCount?: number;
  totalContributions?: number;
  developers: DeveloperSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  sort?: DeveloperSortKey;
};

export type CountryDevelopersResponse = LocationDevelopersResponse;

export type StatsResponse = {
  totalDevs: number;
  totalContributions: number;
  countryLevelDevs: number;
  locationsWithDevs: number;
  lastUpdate: {
    at: string;
    location: string | null;
  } | null;
};

export type SearchParams = {
  languages: string[];
  languageMode: 'any' | 'all';
  locationSlugs: string[];
  zone: 'north' | 'central' | 'south' | null;
  username: string | null;
  displayName: string | null;
  sort: SearchSortKey;
  shareLanguage: string | null;
};

export type SearchInterpretation = SearchParams & {
  resolvedLocationSlugs: string[];
};

export type SearchResponse = {
  interpretation: SearchInterpretation;
  developers: DeveloperSummary[];
};

export type SearchFacets = {
  languages: Array<{ name: string; count: number }>;
  locations: Array<{ slug: string; name: string; kind: 'region' | 'city' }>;
  zones: Array<{ id: 'north' | 'central' | 'south'; label: string }>;
};

export type CandidateStatus = 'candidate' | 'promoted' | 'rejected';

export type CandidateScope = 'region' | 'country';

export type CandidateSortKey = 'stars' | 'regionRank' | 'countryRank';

export type Candidate = {
  login: string;
  name: string | null;
  avatarUrl: string;
  profileUrl: string;
  totalStars: number;
  topLanguages: TopLanguage[];
  rankLevel: string | null;
  followers: number;
  contributions: number;
  regionRank: number | null;
  countryRank: number | null;
  totalStarsAtSelection: number;
  status: CandidateStatus;
  selectedAt: string;
  promotedAt: string | null;
  promotedByLogin: string | null;
  location: {
    slug: string;
    name: string;
    kind: 'country' | 'region' | 'city';
  };
};

export type CandidatesResponse = {
  candidates: Candidate[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
  hasMore: boolean;
  sort: CandidateSortKey;
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

export type AdminMeResponse = {
  login: string;
};

export type CandidatesQuery = {
  status?: CandidateStatus;
  region?: string;
  scope?: CandidateScope;
  sort?: CandidateSortKey;
  limit?: number;
  offset?: number;
};

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  languages: [],
  languageMode: 'any',
  locationSlugs: [],
  zone: null,
  username: null,
  displayName: null,
  sort: DEFAULT_DEVELOPER_SORT,
  shareLanguage: null,
};
