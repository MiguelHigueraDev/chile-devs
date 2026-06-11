export type MapLocation = {
  slug: string;
  name: string;
  kind: 'country' | 'region' | 'city';
  lat: number;
  lng: number;
  devCount: number;
  totalContributions: number;
};

export type DeveloperSortKey = 'contributions' | 'followers' | 'stars';

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

export type SearchInterpretation = {
  languages: string[];
  languageMode: 'any' | 'all';
  locationSlugs: string[];
  zone: 'north' | 'central' | 'south' | null;
  sort: SearchSortKey;
  shareLanguage: string | null;
  resolvedLocationSlugs: string[];
};

export type SearchResponse = {
  query: string;
  interpretation: SearchInterpretation;
  developers: DeveloperSummary[];
};
