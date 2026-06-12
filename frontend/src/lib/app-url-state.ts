import { ALL_CHILE_SLUG, createAllChileLocation } from './all-chile-location';
import type {
  DeveloperSortKey,
  MapLocation,
  SearchParams,
  SearchSortKey,
  StatsResponse,
} from '../types/api';
import { DEFAULT_SEARCH_PARAMS } from '../types/api';

export const APP_URL_PARAMS = {
  location: 'location',
  langs: 'langs',
  langMode: 'langMode',
  locs: 'locs',
  zone: 'zone',
  username: 'username',
  name: 'name',
  sort: 'sort',
  shareLang: 'shareLang',
  dev: 'dev',
} as const;

export const VALID_SORTS = new Set<DeveloperSortKey>([
  'contributions',
  'followers',
  'stars',
  'rank',
]);

export const VALID_SEARCH_SORTS = new Set<SearchSortKey>([
  'contributions',
  'followers',
  'stars',
  'rank',
  'languageShare',
]);

export type AppUrlState = {
  locationSlug: string | null;
  searchParams: SearchParams | null;
  sort: DeveloperSortKey | null;
  devLogin: string | null;
};

function parseCsvParam(value: string | null): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseSortParam(value: string | null): DeveloperSortKey | null {
  if (value && VALID_SORTS.has(value as DeveloperSortKey)) {
    return value as DeveloperSortKey;
  }
  return null;
}

function parseSearchSortParam(value: string | null): SearchSortKey {
  if (value && VALID_SEARCH_SORTS.has(value as SearchSortKey)) {
    return value as SearchSortKey;
  }
  return 'contributions';
}

function hasSearchParams(params: URLSearchParams): boolean {
  return (
    params.has(APP_URL_PARAMS.langs) ||
    params.has(APP_URL_PARAMS.langMode) ||
    params.has(APP_URL_PARAMS.locs) ||
    params.has(APP_URL_PARAMS.zone) ||
    params.has(APP_URL_PARAMS.username) ||
    params.has(APP_URL_PARAMS.name) ||
    params.has(APP_URL_PARAMS.shareLang) ||
    (params.has(APP_URL_PARAMS.sort) && !params.has(APP_URL_PARAMS.location))
  );
}

export function readSearchParamsFromUrl(
  params: URLSearchParams,
): SearchParams | null {
  if (!hasSearchParams(params)) {
    return null;
  }

  const zone = params.get(APP_URL_PARAMS.zone);
  const zoneValue =
    zone === 'north' || zone === 'central' || zone === 'south'
      ? zone
      : null;

  return {
    languages: parseCsvParam(params.get(APP_URL_PARAMS.langs)),
    languageMode:
      params.get(APP_URL_PARAMS.langMode) === 'all' ? 'all' : 'any',
    locationSlugs: parseCsvParam(params.get(APP_URL_PARAMS.locs)),
    zone: zoneValue,
    username: params.get(APP_URL_PARAMS.username)?.trim() || null,
    displayName: params.get(APP_URL_PARAMS.name)?.trim() || null,
    sort: parseSearchSortParam(params.get(APP_URL_PARAMS.sort)),
    shareLanguage: params.get(APP_URL_PARAMS.shareLang)?.trim() || null,
  };
}

export function readAppUrlState(): AppUrlState {
  const params = new URLSearchParams(window.location.search);
  const locationSlug = params.get(APP_URL_PARAMS.location);
  const searchParams = readSearchParamsFromUrl(params);

  return {
    locationSlug: searchParams ? null : locationSlug || null,
    searchParams,
    sort: searchParams
      ? null
      : parseSortParam(params.get(APP_URL_PARAMS.sort)),
    devLogin: params.get(APP_URL_PARAMS.dev) || null,
  };
}

export function buildSearchUrlParams(params: SearchParams): URLSearchParams {
  const urlParams = new URLSearchParams();

  if (params.languages.length > 0) {
    urlParams.set(APP_URL_PARAMS.langs, params.languages.join(','));
  }

  if (params.languageMode === 'all') {
    urlParams.set(APP_URL_PARAMS.langMode, 'all');
  }

  if (params.locationSlugs.length > 0) {
    urlParams.set(APP_URL_PARAMS.locs, params.locationSlugs.join(','));
  }

  if (params.zone) {
    urlParams.set(APP_URL_PARAMS.zone, params.zone);
  }

  if (params.username) {
    urlParams.set(APP_URL_PARAMS.username, params.username);
  }

  if (params.displayName) {
    urlParams.set(APP_URL_PARAMS.name, params.displayName);
  }

  urlParams.set(APP_URL_PARAMS.sort, params.sort);

  if (params.shareLanguage) {
    urlParams.set(APP_URL_PARAMS.shareLang, params.shareLanguage);
  }

  return urlParams;
}

export function buildAppUrlSearchParams(state: AppUrlState): URLSearchParams {
  if (state.searchParams) {
    const params = buildSearchUrlParams(state.searchParams);
    if (state.devLogin) {
      params.set(APP_URL_PARAMS.dev, state.devLogin);
    }
    return params;
  }

  const params = new URLSearchParams();

  if (state.locationSlug) {
    params.set(APP_URL_PARAMS.location, state.locationSlug);
  }

  if (
    state.locationSlug &&
    state.sort &&
    state.sort !== 'contributions'
  ) {
    params.set(APP_URL_PARAMS.sort, state.sort);
  }

  if (state.devLogin) {
    params.set(APP_URL_PARAMS.dev, state.devLogin);
  }

  return params;
}

export function syncAppUrlState(state: AppUrlState, replace = true): void {
  const params = buildAppUrlSearchParams(state);
  const search = params.toString();
  const url = search
    ? `${window.location.pathname}?${search}`
    : window.location.pathname;

  if (`${window.location.pathname}${window.location.search}` === url) {
    return;
  }

  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
}

export function resolveLocationFromSlug(
  slug: string,
  locations: MapLocation[],
  stats: StatsResponse | undefined,
): MapLocation | null {
  if (slug === ALL_CHILE_SLUG) {
    return stats ? createAllChileLocation(stats) : null;
  }

  return locations.find((location) => location.slug === slug) ?? null;
}

export function countActiveSearchFilters(params: SearchParams): number {
  let count = 0;

  if (params.languages.length > 0) count += 1;
  if (params.locationSlugs.length > 0) count += 1;
  if (params.zone) count += 1;
  if (params.username) count += 1;
  if (params.displayName) count += 1;
  if (params.sort !== DEFAULT_SEARCH_PARAMS.sort) count += 1;
  if (params.shareLanguage) count += 1;

  return count;
}

export function isDefaultSearchParams(params: SearchParams): boolean {
  return (
    params.languages.length === 0 &&
    params.languageMode === DEFAULT_SEARCH_PARAMS.languageMode &&
    params.locationSlugs.length === 0 &&
    params.zone === null &&
    params.username === null &&
    params.displayName === null &&
    params.sort === DEFAULT_SEARCH_PARAMS.sort &&
    params.shareLanguage === null
  );
}
