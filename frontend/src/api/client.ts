import type {
  CountryDevelopersResponse,
  DeveloperSortKey,
  LocationDevelopersResponse,
  MapLocation,
  SearchResponse,
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
    let message = `API error ${response.status}: ${path}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (typeof body.message === 'string') {
        message = body.message;
      } else if (Array.isArray(body.message)) {
        message = body.message.join(', ');
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
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

export function fetchSearch(query: string): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  return fetchJson<SearchResponse>(`/search?${params.toString()}`);
}
