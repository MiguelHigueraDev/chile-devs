import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchCountryDevelopers, fetchLocationDevelopers, fetchMapData, fetchStats } from './client'
import type { DeveloperSortKey } from '../types/api'

export const queryKeys = {
  map: ['map'] as const,
  stats: ['stats'] as const,
  countryDevelopers: (sort: DeveloperSortKey) =>
    ['country', 'developers', sort] as const,
  locationDevelopers: (slug: string, sort: DeveloperSortKey) =>
    ['locations', slug, 'developers', sort] as const,
}

export const mapDataQueryOptions = queryOptions({
  queryKey: queryKeys.map,
  queryFn: fetchMapData,
})

export const statsQueryOptions = queryOptions({
  queryKey: queryKeys.stats,
  queryFn: fetchStats,
})

type DevelopersPage = {
  hasMore: boolean;
  nextCursor: string | null;
};

function buildDevelopersInfiniteQueryOptions<TPage extends DevelopersPage>(
  queryKey: readonly unknown[],
  fetchPage: (cursor: string | undefined) => Promise<TPage>,
) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchPage(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
  });
}

export function countryDevelopersInfiniteQueryOptions(sort: DeveloperSortKey) {
  return buildDevelopersInfiniteQueryOptions(
    queryKeys.countryDevelopers(sort),
    (cursor) => fetchCountryDevelopers({ sort, cursor }),
  );
}

export function locationDevelopersInfiniteQueryOptions(
  slug: string,
  sort: DeveloperSortKey,
) {
  return buildDevelopersInfiniteQueryOptions(
    queryKeys.locationDevelopers(slug, sort),
    (cursor) => fetchLocationDevelopers(slug, { sort, cursor }),
  );
}

export function useMapData() {
  return useQuery(mapDataQueryOptions)
}

export function useStats() {
  return useQuery(statsQueryOptions)
}

export function useCountryDevelopers(sort: DeveloperSortKey, enabled = true) {
  return useInfiniteQuery({
    ...countryDevelopersInfiniteQueryOptions(sort),
    enabled,
  })
}

export function useLocationDevelopers(
  slug: string,
  sort: DeveloperSortKey,
  enabled = true,
) {
  return useInfiniteQuery({
    ...locationDevelopersInfiniteQueryOptions(slug, sort),
    enabled,
  })
}
