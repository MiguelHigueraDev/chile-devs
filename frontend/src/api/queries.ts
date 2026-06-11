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

export function countryDevelopersInfiniteQueryOptions(sort: DeveloperSortKey) {
  return infiniteQueryOptions({
    queryKey: queryKeys.countryDevelopers(sort),
    queryFn: ({ pageParam }) =>
      fetchCountryDevelopers({
        sort,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
  })
}

export function locationDevelopersInfiniteQueryOptions(
  slug: string,
  sort: DeveloperSortKey,
) {
  return infiniteQueryOptions({
    queryKey: queryKeys.locationDevelopers(slug, sort),
    queryFn: ({ pageParam }) =>
      fetchLocationDevelopers(slug, {
        sort,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
  })
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
