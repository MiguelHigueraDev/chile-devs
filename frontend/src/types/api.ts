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
  profileUrl: string;
  rawLocation: string | null;
};

export type DeveloperDetail = DeveloperSummary & {
  locationName: string;
  portfolioUrl: string | null;
  description: string | null;
  role: string | null;
  claimed: boolean;
};

export type MeResponse = {
  login: string;
  avatarUrl: string | null;
  hasProfile: boolean;
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

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  languages: [],
  languageMode: 'any',
  locationSlugs: [],
  zone: null,
  username: null,
  displayName: null,
  sort: 'contributions',
  shareLanguage: null,
};
