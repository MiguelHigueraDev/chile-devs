import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchAdminMe,
  fetchCandidates,
  fetchCountryDevelopers,
  fetchDeveloper,
  fetchLocationDevelopers,
  fetchMapData,
  fetchMe,
  fetchPromotedReposList,
  fetchRepo,
  fetchReposInViewport,
  fetchSearch,
  fetchSearchFacets,
  fetchStats,
  logout,
  optOut,
  promoteCandidate,
  refreshCandidates,
  rejectCandidate,
  resetCandidate,
  updateMyProfile,
} from "./client";
import {
  DEFAULT_SEARCH_PARAMS,
  type CandidatesQuery,
  type SearchParams,
  type UpdateProfileInput,
} from "../types/api";
import { fetchGithubStars } from "../lib/github";
import { resetAccumulatedReposCache } from "../lib/use-accumulated-repos-in-viewport";
import type { DeveloperSortKey } from "../types/api";

export const queryKeys = {
  map: ["map"] as const,
  repos: (bbox: string) => ["repos", bbox] as const,
  reposList: (regionSlug: string) => ["repos", "list", regionSlug] as const,
  repo: (nameWithOwner: string) => ["repos", "by-name", nameWithOwner] as const,
  stats: ["stats"] as const,
  githubStars: ["github", "stars"] as const,
  me: ["auth", "me"] as const,
  developer: (login: string) => ["developers", login] as const,
  search: (params: SearchParams) => ["search", params] as const,
  searchFacets: ["search", "facets"] as const,
  countryDevelopers: (sort: DeveloperSortKey) =>
    ["country", "developers", sort] as const,
  locationDevelopers: (slug: string, sort: DeveloperSortKey) =>
    ["locations", slug, "developers", sort] as const,
  adminMe: ["admin", "me"] as const,
  candidates: (query: CandidatesQuery) =>
    ["admin", "repo-candidates", query] as const,
};

export const mapDataQueryOptions = queryOptions({
  queryKey: queryKeys.map,
  queryFn: fetchMapData,
});

export function reposInViewportQueryOptions(bbox: string | null) {
  return queryOptions({
    queryKey: queryKeys.repos(bbox ?? ""),
    queryFn: () => fetchReposInViewport(bbox!),
    enabled: bbox != null,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  });
}

export const statsQueryOptions = queryOptions({
  queryKey: queryKeys.stats,
  queryFn: fetchStats,
});

export const githubStarsQueryOptions = queryOptions({
  queryKey: queryKeys.githubStars,
  queryFn: fetchGithubStars,
  staleTime: 30 * 60 * 1000,
});

export const searchFacetsQueryOptions = queryOptions({
  queryKey: queryKeys.searchFacets,
  queryFn: fetchSearchFacets,
  staleTime: 10 * 60 * 1000,
});

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
    queryFn: ({ pageParam }) => fetchPage(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    placeholderData: keepPreviousData,
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
  return useQuery(mapDataQueryOptions);
}

export function useReposInViewport(bbox: string | null, enabled = true) {
  return useQuery({
    ...reposInViewportQueryOptions(bbox),
    enabled: enabled && bbox != null,
  });
}

function buildReposListInfiniteQueryOptions(regionSlug: string | null) {
  const apiRegion =
    regionSlug && regionSlug !== '__all__' ? regionSlug : undefined;

  return infiniteQueryOptions({
    queryKey: queryKeys.reposList(regionSlug ?? '__all__'),
    queryFn: ({ pageParam }) =>
      fetchPromotedReposList({
        region: apiRegion,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    placeholderData: keepPreviousData,
  });
}

export function usePromotedReposList(
  regionSlug: string | null,
  enabled = true,
) {
  return useInfiniteQuery({
    ...buildReposListInfiniteQueryOptions(regionSlug),
    enabled: enabled && regionSlug != null,
  });
}

export function useRepo(nameWithOwner: string | null) {
  return useQuery({
    queryKey: queryKeys.repo(nameWithOwner ?? ""),
    queryFn: () => fetchRepo(nameWithOwner!),
    enabled: !!nameWithOwner,
    staleTime: 60 * 1000,
  });
}

export function useStats() {
  return useQuery(statsQueryOptions);
}

export function useGithubStars() {
  return useQuery(githubStarsQueryOptions);
}

export function useSearchFacets() {
  return useQuery(searchFacetsQueryOptions);
}

export function useCountryDevelopers(sort: DeveloperSortKey, enabled = true) {
  return useInfiniteQuery({
    ...countryDevelopersInfiniteQueryOptions(sort),
    enabled,
  });
}

export function useLocationDevelopers(
  slug: string,
  sort: DeveloperSortKey,
  enabled = true,
) {
  return useInfiniteQuery({
    ...locationDevelopersInfiniteQueryOptions(slug, sort),
    enabled,
  });
}

export function useSearch(params: SearchParams | null, enabled = true) {
  const effectiveParams = params ?? DEFAULT_SEARCH_PARAMS;
  return useQuery({
    queryKey: queryKeys.search(effectiveParams),
    queryFn: () => fetchSearch(effectiveParams),
    enabled: enabled && params != null,
    staleTime: 5 * 60 * 1000,
  });
}

export const meQueryOptions = queryOptions({
  queryKey: queryKeys.me,
  queryFn: fetchMe,
  retry: false,
  staleTime: 5 * 60 * 1000,
});

export function useMe() {
  return useQuery(meQueryOptions);
}

export function useDeveloper(login: string | null) {
  return useQuery({
    queryKey: queryKeys.developer(login ?? ""),
    queryFn: () => fetchDeveloper(login!),
    enabled: !!login,
    staleTime: 60 * 1000,
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMyProfile(input),
    onSuccess: (developer) => {
      queryClient.setQueryData(queryKeys.developer(developer.login), developer);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me });
      queryClient.setQueryData(queryKeys.me, null);
    },
  });
}

export function useOptOutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: optOut,
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me });
      queryClient.setQueryData(queryKeys.me, null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.map });
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      await queryClient.invalidateQueries({ queryKey: ["search"] });
      await queryClient.invalidateQueries({ queryKey: ["country"] });
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      await queryClient.invalidateQueries({ queryKey: ["developers"] });
    },
  });
}

export function useAdminMe() {
  return useQuery({
    queryKey: queryKeys.adminMe,
    queryFn: fetchAdminMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCandidatesInfinite(
  query: Omit<CandidatesQuery, "offset">,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.candidates(query),
    queryFn: ({ pageParam }) =>
      fetchCandidates({ ...query, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextOffset ?? undefined) : undefined,
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useRefreshCandidatesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refreshCandidates,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "repo-candidates"],
      });
    },
  });
}

export function usePromoteCandidateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: promoteCandidate,
    onSuccess: () => {
      resetAccumulatedReposCache();
      void queryClient.invalidateQueries({
        queryKey: ["admin", "repo-candidates"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["repos"],
        refetchType: "none",
      });
    },
  });
}

export function useRejectCandidateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rejectCandidate,
    onSuccess: () => {
      resetAccumulatedReposCache();
      void queryClient.invalidateQueries({
        queryKey: ["admin", "repo-candidates"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["repos"],
        refetchType: "none",
      });
    },
  });
}

export function useResetCandidateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resetCandidate,
    onSuccess: () => {
      resetAccumulatedReposCache();
      void queryClient.invalidateQueries({
        queryKey: ["admin", "repo-candidates"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["repos"],
        refetchType: "none",
      });
    },
  });
}
