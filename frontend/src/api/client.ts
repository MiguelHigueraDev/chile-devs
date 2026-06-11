import { getDeveloperSortPreference } from '../lib/developer-sort-preference';
import type {
  CountryDevelopersResponse,
  DeveloperDetail,
  DeveloperSortKey,
  LocationDevelopersResponse,
  MapLocation,
  MeResponse,
  SearchResponse,
  StatsResponse,
  UpdateProfileInput,
} from '../types/api';

function getApiBase(): string {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    return `${backendUrl.replace(/\/$/, '')}/api`;
  }
  return '/api';
}

const API_BASE = getApiBase();

type FetchJsonOptions = {
  method?: string;
  body?: unknown;
  credentials?: RequestCredentials;
};

async function fetchJson<T>(
  path: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const { method = 'GET', body, credentials } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let message = `API error ${response.status}: ${path}`;
    try {
      const responseBody = (await response.json()) as {
        message?: string | string[];
      };
      if (typeof responseBody.message === 'string') {
        message = responseBody.message;
      } else if (Array.isArray(responseBody.message)) {
        message = responseBody.message.join(', ');
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

export function fetchSearch(
  query: string,
  sort: DeveloperSortKey = getDeveloperSortPreference(),
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, sort });
  return fetchJson<SearchResponse>(`/search?${params.toString()}`);
}

export function fetchDeveloper(login: string): Promise<DeveloperDetail> {
  return fetchJson<DeveloperDetail>(`/developers/${encodeURIComponent(login)}`);
}

export async function fetchMe(): Promise<MeResponse | null> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include',
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`API error ${response.status}: /auth/me`);
  }
  return response.json() as Promise<MeResponse>;
}

export function updateMyProfile(
  input: UpdateProfileInput,
): Promise<DeveloperDetail> {
  return fetchJson<DeveloperDetail>('/developers/me', {
    method: 'PATCH',
    body: input,
    credentials: 'include',
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

export function getGitHubAuthUrl(): string {
  return `${API_BASE}/auth/github`;
}
