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

export function fetchLocationDevelopers(
  slug: string,
  limit = 10,
): Promise<LocationDevelopersResponse> {
  return fetchJson<LocationDevelopersResponse>(
    `/locations/${slug}/developers?limit=${limit}`,
  );
}
