import { ALL_CHILE_SLUG, createAllChileLocation } from './all-chile-location';
import type { DeveloperSortKey, MapLocation, StatsResponse } from '../types/api';

export const APP_URL_PARAMS = {
  location: 'location',
  search: 'q',
  sort: 'sort',
  dev: 'dev',
} as const;

export const VALID_SORTS = new Set<DeveloperSortKey>([
  'contributions',
  'followers',
  'stars',
]);

export type AppUrlState = {
  locationSlug: string | null;
  searchQuery: string | null;
  sort: DeveloperSortKey | null;
  devLogin: string | null;
};

export function parseSortParam(value: string | null): DeveloperSortKey | null {
  if (value && VALID_SORTS.has(value as DeveloperSortKey)) {
    return value as DeveloperSortKey;
  }
  return null;
}

export function readAppUrlState(): AppUrlState {
  const params = new URLSearchParams(window.location.search);
  const locationSlug = params.get(APP_URL_PARAMS.location);
  const searchQuery = params.get(APP_URL_PARAMS.search);

  return {
    locationSlug: locationSlug || null,
    searchQuery: searchQuery || null,
    sort: searchQuery
      ? null
      : parseSortParam(params.get(APP_URL_PARAMS.sort)),
    devLogin: params.get(APP_URL_PARAMS.dev) || null,
  };
}

export function buildAppUrlSearchParams(state: AppUrlState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.searchQuery) {
    params.set(APP_URL_PARAMS.search, state.searchQuery);
  } else if (state.locationSlug) {
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
