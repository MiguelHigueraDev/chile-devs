import { memo, useEffect, useMemo, useRef } from 'react'
import { GitFork, Star } from 'lucide-react'
import { usePromotedReposList, useSearchFacets } from '../api/queries'
import { ALL_CHILE_SLUG, isAllChileLocation } from '../lib/all-chile-location'
import { getGitHubAvatarUrl } from '../lib/github'
import {
  getFilterListState,
  getListLoadingPresentation,
  useStaleWhileRevalidate,
} from '../lib/filter-list-state'
import { useStackedSheetDismissGuard } from '../lib/stacked-sheet-dismiss'
import { toSafeHttpsUrl } from '../lib/safe-url'
import { formatNumber, cn } from '../lib/utils'
import type { MapLocation, MapRepo } from '../types/api'
import { RegionScopeSelect } from './RegionScopeSelect'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

type RepoListPanelProps = {
  location: MapLocation | null
  showRegionPicker?: boolean
  onRegionChange: (slug: string) => void
  onClose: () => void
  onRepoSelect?: (repo: MapRepo) => void
  repoDetailOpen?: boolean
}

type RepoListContentProps = {
  regionSlug: string
  scrollRootRef: React.RefObject<HTMLDivElement | null>
  onRepoSelect?: (repo: MapRepo) => void
}

function RepoListContent({
  regionSlug,
  scrollRootRef,
  onRepoSelect,
}: RepoListContentProps) {
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isFetching,
    isPlaceholderData,
  } = usePromotedReposList(regionSlug)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { showInitialSkeleton, isRefreshing } = getFilterListState({
    isPending,
    isFetching,
    isPlaceholderData,
    data,
  })

  const repos = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    return data.pages.flatMap((page) =>
      page.repos.filter((repo) => {
        if (seen.has(repo.repoGithubId)) return false
        seen.add(repo.repoGithubId)
        return true
      }),
    )
  }, [data])

  const totalCount = data?.pages.find((page) => page.total != null)?.total ?? null
  const hasMore = hasNextPage ?? false
  const { visibleItems: visibleRepos, hasStaleFallback } =
    useStaleWhileRevalidate(repos)
  const { showFullSkeleton, isDimmed } = getListLoadingPresentation({
    showInitialSkeleton,
    isRefreshing,
    hasStaleFallback,
  })

  useEffect(() => {
    const sentinel = sentinelRef.current
    const scrollRoot = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    )
    if (
      !sentinel ||
      !scrollRoot ||
      showFullSkeleton ||
      isFetchingNextPage ||
      !hasMore
    ) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage()
        }
      },
      { root: scrollRoot, rootMargin: '100px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchNextPage, hasMore, isFetchingNextPage, showFullSkeleton, scrollRootRef])

  if (showFullSkeleton) {
    return (
      <div className="space-y-3 px-4 py-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-7" />
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    )
  }

  if (error && visibleRepos.length === 0) {
    return (
      <p className="text-destructive px-4 py-4 text-sm">{error.message}</p>
    )
  }

  if (visibleRepos.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-4 text-sm">
        No featured repos found for this region.
      </p>
    )
  }

  return (
    <div
      className={cn(
        'transition-opacity duration-150',
        isDimmed && 'pointer-events-none opacity-60',
      )}
    >
      <ul className="divide-border/60 divide-y">
        {visibleRepos.map((repo, index) => {
          const avatarUrl =
            toSafeHttpsUrl(repo.owner.avatarUrl) ??
            getGitHubAvatarUrl(repo.owner.login)

          return (
            <li key={repo.repoGithubId}>
              <button
                type="button"
                className="hover:bg-accent/50 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
                onClick={() => onRepoSelect?.(repo)}
              >
                <span className="text-muted-foreground w-7 shrink-0 pt-0.5 text-sm tabular-nums">
                  {index + 1}
                </span>
                <Avatar className="size-8 shrink-0">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={repo.owner.login} />
                  ) : null}
                  <AvatarFallback className="text-[10px]">
                    {repo.owner.login.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{repo.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {repo.nameWithOwner}
                  </p>
                  {repo.description ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {repo.description.length > 100
                        ? `${repo.description.slice(0, 100)}…`
                        : repo.description}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      <Star className="size-3" />
                      {formatNumber(repo.stars)}
                    </Badge>
                    {repo.primaryLanguage && (
                      <Badge variant="outline" className="text-[10px]">
                        {repo.primaryLanguage}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {repo.scope === 'regional' ? 'Regional' : 'National'}
                    </Badge>
                  </div>
                </div>
                <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
                  <GitFork className="size-3" />
                  {formatNumber(repo.forks)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div ref={sentinelRef} className="h-px" aria-hidden />
      {isFetchingNextPage && (
        <div className="space-y-3 px-4 py-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-4 w-7" />
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-32" />
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="text-destructive px-4 pt-2 text-sm">{error.message}</p>
      )}
      <p className="text-muted-foreground px-4 pt-2 pb-3 text-xs">
        {hasMore
          ? `Showing ${formatNumber(visibleRepos.length)}${totalCount != null ? ` of ${formatNumber(totalCount)}` : ''} repos`
          : totalCount != null
            ? `All ${formatNumber(totalCount)} repos loaded`
            : `Showing ${formatNumber(visibleRepos.length)} repos`}
      </p>
    </div>
  )
}

type RepoListPanelStatsProps = {
  regionSlug: string;
};

const RepoListPanelStats = memo(function RepoListPanelStats({
  regionSlug,
}: RepoListPanelStatsProps) {
  const reposQuery = usePromotedReposList(regionSlug);
  const { showInitialSkeleton, isRefreshing } = getFilterListState(reposQuery);
  const totalCount =
    reposQuery.data?.pages.find((page) => page.total != null)?.total ?? null;
  const showStatsSkeleton = showInitialSkeleton && totalCount == null;

  if (totalCount == null && !showStatsSkeleton) {
    return <div className="min-h-[26px] pt-2" />;
  }

  return (
    <div
      className={cn(
        'flex min-h-[26px] flex-wrap gap-2 pt-2 transition-opacity duration-150',
        isRefreshing && 'opacity-60',
      )}
    >
      {showStatsSkeleton ? (
        <Skeleton className="h-5 w-32" />
      ) : totalCount != null ? (
        <Badge variant="secondary">
          {formatNumber(totalCount)} featured repos
        </Badge>
      ) : null}
    </div>
  );
});

export function RepoListPanel({
  location,
  showRegionPicker = false,
  onRegionChange,
  onClose,
  onRepoSelect,
  repoDetailOpen = false,
}: RepoListPanelProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const regionSlug = location?.slug ?? null
  const countryWide = location ? isAllChileLocation(location) : false
  const { data: facets } = useSearchFacets()
  const { handleOpenChange, blockOutsideDismiss } =
    useStackedSheetDismissGuard(repoDetailOpen)

  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    )
    viewport?.scrollTo({ top: 0 })
  }, [regionSlug])

  return (
    <Sheet
      open={!!location}
      modal={false}
      onOpenChange={(open) => handleOpenChange(open, onClose)}
    >
      <SheetContent
        side="right"
        inert={repoDetailOpen ? true : undefined}
        onPointerDownOutside={blockOutsideDismiss}
        onInteractOutside={blockOutsideDismiss}
        onFocusOutside={blockOutsideDismiss}
        className="border-border/60 bg-background/98 flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {location && regionSlug && (
          <>
            <SheetHeader className="shrink-0 border-b px-5 pb-4">
              <SheetTitle className="text-lg">{location.name}</SheetTitle>
              <SheetDescription>
                Featured repos ranked by stars
              </SheetDescription>
              <RepoListPanelStats regionSlug={regionSlug} />
              {showRegionPicker && (
                <RegionScopeSelect
                  id="repo-region-scope"
                  value={countryWide ? ALL_CHILE_SLUG : regionSlug}
                  facets={facets}
                  onChange={onRegionChange}
                />
              )}
            </SheetHeader>

            <ScrollArea ref={scrollRootRef} className="min-h-0 flex-1">
              <RepoListContent
                regionSlug={regionSlug}
                scrollRootRef={scrollRootRef}
                onRepoSelect={onRepoSelect}
              />
            </ScrollArea>

            <Separator className="shrink-0" />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
