import type {
  CountryDevelopersResponse,
  DeveloperSortKey,
  LocationDevelopersResponse,
  MapLocation,
  StatsResponse,
} from '../types/api';

function getApiBase(): string {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    return `${backendUrl.replace(/\/$/, '')}/api`;
  }
  return '/api';
}

const API_BASE = getApiBase();

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${path}`);
  }
  return response.json() as Promise<T>;
}

export function fetchMapData(): Promise<MapLocation[]> {
  return fetchJson<MapLocation[]>('/map');
}

export function fetchStats(): Promise<StatsResponse> {
  return fetchJson<StatsResponse>('/stats');
}

export type FetchLocationDevelopersOptions = {
  cursor?: string;
  limit?: number;
  sort?: DeveloperSortKey;
};

function buildDeveloperQueryParams(
  options: FetchLocationDevelopersOptions = {},
): URLSearchParams {
  const { cursor, limit = 10, sort = 'contributions' } = options;
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return params;
}

export function fetchCountryDevelopers(
  options: FetchLocationDevelopersOptions = {},
): Promise<CountryDevelopersResponse> {
  return fetchJson<CountryDevelopersResponse>(
    `/developers?${buildDeveloperQueryParams(options).toString()}`,
  );
}

export function fetchLocationDevelopers(
  slug: string,
  options: FetchLocationDevelopersOptions = {},
): Promise<LocationDevelopersResponse> {
  return fetchJson<LocationDevelopersResponse>(
    `/locations/${slug}/developers?${buildDeveloperQueryParams(options).toString()}`,
  );
}
