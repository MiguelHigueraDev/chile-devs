import type {
  LocationDevelopersResponse,
  MapLocation,
  StatsResponse,
} from '../types/api';

const API_BASE = '/api';

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
};

export function fetchLocationDevelopers(
  slug: string,
  options: FetchLocationDevelopersOptions = {},
): Promise<LocationDevelopersResponse> {
  const { cursor, limit = 10 } = options;
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set('cursor', cursor);
  }

  return fetchJson<LocationDevelopersResponse>(
    `/locations/${slug}/developers?${params.toString()}`,
  );
}
