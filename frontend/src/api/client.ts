import {
  clearAuthToken,
  getAuthToken,
} from '../lib/auth-token';
import type {
  AdminMeResponse,
  CandidatesQuery,
  CandidatesResponse,
  CountryDevelopersResponse,
  DeveloperDetail,
  DeveloperSortKey,
  LocationDevelopersResponse,
  MapLocation,
  MeResponse,
  RefreshCandidatesSummary,
  SearchFacets,
  SearchParams,
  SearchResponse,
  StatsResponse,
  UpdateProfileInput,
} from '../types/api';
import { DEFAULT_DEVELOPER_SORT } from '../types/api';

function getApiBase(): string {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    return `${backendUrl.replace(/\/$/, '')}/api`;
  }
  return '/api';
}

const API_BASE = getApiBase();

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type FetchJsonOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

function buildHeaders(options: {
  body?: unknown;
  auth?: boolean;
}): HeadersInit | undefined {
  const headers: Record<string, string> = {};

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.auth) {
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

async function fetchJson<T>(
  path: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = false } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: buildHeaders({ body, auth }),
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
    throw new ApiError(response.status, message);
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
  const { cursor, limit = 10, sort = DEFAULT_DEVELOPER_SORT } = options;
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

export function buildSearchQueryParams(params: SearchParams): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.languages.length > 0) {
    searchParams.set('languages', params.languages.join(','));
  }

  if (params.languageMode === 'all') {
    searchParams.set('langMode', 'all');
  }

  if (params.locationSlugs.length > 0) {
    searchParams.set('locations', params.locationSlugs.join(','));
  }

  if (params.zone) {
    searchParams.set('zone', params.zone);
  }

  if (params.username) {
    searchParams.set('username', params.username);
  }

  if (params.displayName) {
    searchParams.set('name', params.displayName);
  }

  searchParams.set('sort', params.sort);

  if (params.shareLanguage) {
    searchParams.set('shareLang', params.shareLanguage);
  }

  return searchParams;
}

export function fetchSearch(params: SearchParams): Promise<SearchResponse> {
  const query = buildSearchQueryParams(params).toString();
  return fetchJson<SearchResponse>(`/search${query ? `?${query}` : ''}`);
}

export function fetchSearchFacets(): Promise<SearchFacets> {
  return fetchJson<SearchFacets>('/search/facets');
}

export function fetchDeveloper(login: string): Promise<DeveloperDetail> {
  return fetchJson<DeveloperDetail>(`/developers/${encodeURIComponent(login)}`);
}

export async function fetchMe(): Promise<MeResponse | null> {
  const token = getAuthToken();
  if (!token) {
    return null;
  }

  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    clearAuthToken();
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
    auth: true,
  });
}

export async function logout(): Promise<{ ok: boolean }> {
  try {
    if (!getAuthToken()) {
      return { ok: true };
    }
    return await fetchJson<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      auth: true,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { ok: true };
    }
    throw error;
  } finally {
    clearAuthToken();
  }
}

export async function optOut(): Promise<{ deletedProfile: boolean }> {
  try {
    const result = await fetchJson<{ deletedProfile: boolean }>('/auth/opt-out', {
      method: 'POST',
      auth: true,
    });
    clearAuthToken();
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAuthToken();
    }
    throw error;
  }
}

export function getGitHubAuthUrl(): string {
  return `${API_BASE}/auth/github`;
}

export function fetchAdminMe(): Promise<AdminMeResponse> {
  return fetchJson<AdminMeResponse>('/admin/me', { auth: true });
}

export function fetchCandidates(
  query: CandidatesQuery = {},
): Promise<CandidatesResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.region) params.set('region', query.region);
  if (query.scope) params.set('scope', query.scope);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.offset != null) params.set('offset', String(query.offset));
  const queryString = params.toString();
  return fetchJson<CandidatesResponse>(
    `/admin/candidates${queryString ? `?${queryString}` : ''}`,
    { auth: true },
  );
}

export function refreshCandidates(input: {
  perRegion?: number;
  perCountry?: number;
} = {}): Promise<RefreshCandidatesSummary> {
  return fetchJson<RefreshCandidatesSummary>('/admin/candidates/refresh', {
    method: 'POST',
    body: input,
    auth: true,
  });
}

export function promoteCandidate(
  login: string,
): Promise<{ login: string; status: 'promoted' }> {
  return fetchJson(`/admin/candidates/${encodeURIComponent(login)}/promote`, {
    method: 'POST',
    auth: true,
  });
}

export function rejectCandidate(
  login: string,
): Promise<{ login: string; status: 'rejected' }> {
  return fetchJson(`/admin/candidates/${encodeURIComponent(login)}/reject`, {
    method: 'POST',
    auth: true,
  });
}

export function resetCandidate(
  login: string,
): Promise<{ login: string; status: 'candidate' }> {
  return fetchJson(`/admin/candidates/${encodeURIComponent(login)}/reset`, {
    method: 'POST',
    auth: true,
  });
}
