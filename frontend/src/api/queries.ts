import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  fetchCountryDevelopers,
  fetchDeveloper,
  fetchLocationDevelopers,
  fetchMapData,
  fetchMe,
  fetchSearch,
  fetchStats,
  logout,
  updateMyProfile,
} from './client'
import type { UpdateProfileInput } from '../types/api'
import { fetchGithubStars } from '../lib/github'
import type { DeveloperSortKey } from '../types/api'

export const queryKeys = {
  map: ['map'] as const,
  stats: ['stats'] as const,
  githubStars: ['github', 'stars'] as const,
  me: ['auth', 'me'] as const,
  developer: (login: string) => ['developers', login] as const,
  search: (query: string, sort: DeveloperSortKey) =>
    ['search', query, sort] as const,
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

export const githubStarsQueryOptions = queryOptions({
  queryKey: queryKeys.githubStars,
  queryFn: fetchGithubStars,
  staleTime: 30 * 60 * 1000,
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

export function useGithubStars() {
  return useQuery(githubStarsQueryOptions)
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

export function useSearch(query: string | null, sort: DeveloperSortKey) {
  return useQuery({
    queryKey: queryKeys.search(query ?? '', sort),
    queryFn: () => fetchSearch(query!, sort),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
  })
}

export const meQueryOptions = queryOptions({
  queryKey: queryKeys.me,
  queryFn: fetchMe,
  retry: false,
  staleTime: 5 * 60 * 1000,
})

export function useMe() {
  return useQuery(meQueryOptions)
}

export function useDeveloper(login: string | null) {
  return useQuery({
    queryKey: queryKeys.developer(login ?? ''),
    queryFn: () => fetchDeveloper(login!),
    enabled: !!login,
    staleTime: 60 * 1000,
  })
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMyProfile(input),
    onSuccess: (developer) => {
      queryClient.setQueryData(
        queryKeys.developer(developer.login),
        developer,
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.me })
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me })
      queryClient.setQueryData(queryKeys.me, null)
    },
  })
}
