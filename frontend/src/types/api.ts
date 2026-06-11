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

export type DeveloperSummary = {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributions: number;
  followers: number;
  totalStars: number;
  profileUrl: string;
  rawLocation: string | null;
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
};

export type StatsResponse = {
  totalDevs: number;
  totalContributions: number;
  countryLevelDevs: number;
  locationsWithDevs: number;
};
