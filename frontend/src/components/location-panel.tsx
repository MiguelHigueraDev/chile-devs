import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import {
  useCountryDevelopers,
  useLocationDevelopers,
  useSearch,
  useSearchFacets,
} from "../api/queries";
import { ALL_CHILE_SLUG, isAllChileLocation } from "../lib/all-chile-location";
import {
  getFilterListState,
  getListLoadingPresentation,
  useStaleWhileRevalidate,
} from "../lib/filter-list-state";
import { useStackedSheetDismissGuard } from "../lib/stacked-sheet-dismiss";
import { cn, formatNumber } from "../lib/utils";
import { RANK_SORT_LABEL } from "../lib/rank";
import {
  DEFAULT_SEARCH_PARAMS,
  type DeveloperSortKey,
  type DeveloperSummary,
  type MapLocation,
  type SearchParams,
} from "../types/api";
import { DeveloperList } from "./developer-list";
import { RegionScopeSelect } from "./region-scope-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type LocationPanelProps = {
  location: MapLocation | null;
  sortBy: DeveloperSortKey;
  showRegionPicker?: boolean;
  onSortChange: (sort: DeveloperSortKey) => void;
  onRegionChange: (slug: string) => void;
  onClose: () => void;
  onDeveloperSelect?: (login: string) => void;
  devPanelOpen?: boolean;
};

type LocationDevelopersListProps = {
  slug: string;
  sortBy: DeveloperSortKey;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  countryWide?: boolean;
  onDeveloperSelect?: (login: string) => void;
};

const SORT_OPTIONS: Array<{ value: DeveloperSortKey; label: string }> = [
  { value: "rank", label: RANK_SORT_LABEL },
  { value: "stars", label: "Stars" },
  { value: "followers", label: "Followers" },
  { value: "contributions", label: "Contributions (last year)" },
];

function LocationDevelopersList({
  slug,
  sortBy,
  scrollRootRef,
  countryWide = false,
  onDeveloperSelect,
}: LocationDevelopersListProps) {
  const locationQuery = useLocationDevelopers(slug, sortBy, !countryWide);
  const countryQuery = useCountryDevelopers(sortBy, countryWide);
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isFetching,
    isPlaceholderData,
  } = countryWide ? countryQuery : locationQuery;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { showInitialSkeleton, isRefreshing } = getFilterListState({
    isPending,
    isFetching,
    isPlaceholderData,
    data,
  });

  const developers = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return data.pages.flatMap((page) =>
      page.developers.filter((dev) => {
        if (seen.has(dev.login)) return false;
        seen.add(dev.login);
        return true;
      }),
    );
  }, [data]);

  const totalCount =
    data?.pages.find((page) => page.devCount != null)?.devCount ?? null;
  const hasMore = hasNextPage ?? false;
  const { visibleItems: visibleDevelopers, hasStaleFallback } =
    useStaleWhileRevalidate(developers, isPlaceholderData);
  const { showFullSkeleton, isDimmed } = getListLoadingPresentation({
    showInitialSkeleton,
    isRefreshing,
    hasStaleFallback,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollRoot = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    if (
      !sentinel ||
      !scrollRoot ||
      showFullSkeleton ||
      isFetchingNextPage ||
      !hasMore
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage();
        }
      },
      { root: scrollRoot, rootMargin: "100px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, isFetchingNextPage, showFullSkeleton, scrollRootRef]);

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
    );
  }

  if (error && visibleDevelopers.length === 0) {
    return (
      <p className="text-destructive px-4 py-4 text-sm">{error.message}</p>
    );
  }

  if (visibleDevelopers.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-4 text-sm">
        No developers found for this location.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "transition-opacity duration-150",
        isDimmed && "pointer-events-none opacity-60",
      )}
    >
      <DeveloperList
        developers={visibleDevelopers}
        sortBy={sortBy}
        showSummary={false}
        onDeveloperSelect={onDeveloperSelect}
      />
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
      <p className="text-muted-foreground px-4 pt-2 text-xs">
        {hasMore
          ? `Showing ${formatNumber(visibleDevelopers.length)}${totalCount != null ? ` of ${formatNumber(totalCount)}` : ""} developers`
          : totalCount != null
            ? `All ${formatNumber(totalCount)} developers loaded`
            : `Showing ${formatNumber(visibleDevelopers.length)} developers`}
      </p>
    </div>
  );
}

type LocationSearchResultsProps = {
  slug: string;
  countryWide: boolean;
  query: string;
  scopeName: string;
  onDeveloperSelect?: (login: string) => void;
};

/**
 * Server-side "find your rank" search. Queries `/api/search` scoped to the
 * current location (or the whole country) by username/name and shows each
 * match with its true precomputed standing — so a developer ranked deep in the
 * list is found instantly without paging through the infinite list.
 */
function LocationSearchResults({
  slug,
  countryWide,
  query,
  scopeName,
  onDeveloperSelect,
}: LocationSearchResultsProps) {
  const params = useMemo<SearchParams>(
    () => ({
      ...DEFAULT_SEARCH_PARAMS,
      username: query,
      displayName: query,
      locationSlugs: countryWide ? [] : [slug],
      sort: "rank",
    }),
    [query, countryWide, slug],
  );

  const { data, isPending, isFetching, error } = useSearch(params, true);

  const results = useMemo(() => {
    const devs = data?.developers ?? [];
    const positionOf = (dev: DeveloperSummary) =>
      (countryWide ? dev.rankCountry : dev.rankLocation) ??
      Number.MAX_SAFE_INTEGER;
    return [...devs].sort((a, b) => positionOf(a) - positionOf(b));
  }, [data, countryWide]);

  if (isPending) {
    return (
      <div className="space-y-3 px-4 py-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-7" />
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive px-4 py-4 text-sm">{error.message}</p>;
  }

  if (results.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-4 text-sm">
        No developer matches “{query}” in {scopeName}.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "transition-opacity duration-150",
        isFetching && "opacity-60",
      )}
    >
      <p className="text-muted-foreground px-4 pt-3 pb-1 text-xs">
        {results.length === 1
          ? `1 match in ${scopeName}`
          : `${formatNumber(results.length)} matches in ${scopeName}`}
        {" · ranked position shown"}
      </p>
      <DeveloperList
        developers={results}
        sortBy="rank"
        showSummary={false}
        onDeveloperSelect={onDeveloperSelect}
        getRank={(dev) => (countryWide ? dev.rankCountry : dev.rankLocation)}
      />
    </div>
  );
}

type LocationPanelStatsProps = {
  slug: string;
  sortBy: DeveloperSortKey;
  countryWide: boolean;
  location: MapLocation;
};

const LocationPanelStats = memo(function LocationPanelStats({
  slug,
  sortBy,
  countryWide,
  location,
}: LocationPanelStatsProps) {
  const locationQuery = useLocationDevelopers(slug, sortBy, !countryWide);
  const countryQuery = useCountryDevelopers(sortBy, countryWide);
  const activeQuery = countryWide ? countryQuery : locationQuery;
  const { showInitialSkeleton, isRefreshing } =
    getFilterListState(activeQuery);
  const devCount =
    activeQuery.data?.pages.find((page) => page.devCount != null)?.devCount ??
    null;
  const totalContributions =
    activeQuery.data?.pages.find((page) => page.totalContributions != null)
      ?.totalContributions ?? null;
  const showStatsSkeleton =
    showInitialSkeleton && devCount == null && totalContributions == null;

  return (
    <div
      className={cn(
        "flex min-h-[26px] flex-wrap gap-2 pt-2 transition-opacity duration-150",
        isRefreshing && "opacity-60",
      )}
    >
      {showStatsSkeleton ? (
        <>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-36" />
        </>
      ) : (
        <>
          <Badge variant="secondary">
            {formatNumber(devCount ?? location.devCount)} developers
          </Badge>
          <Badge variant="outline">
            {formatNumber(totalContributions ?? location.totalContributions)}{" "}
            contributions
          </Badge>
        </>
      )}
    </div>
  );
});

export function LocationPanel({
  location,
  sortBy,
  showRegionPicker = false,
  onSortChange,
  onRegionChange,
  onClose,
  onDeveloperSelect,
  devPanelOpen = false,
}: LocationPanelProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const { data: facets } = useSearchFacets();
  const slug = location?.slug ?? null;
  const countryWide = location ? isAllChileLocation(location) : false;
  const { handleOpenChange, blockOutsideDismiss } =
    useStackedSheetDismissGuard(devPanelOpen);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [prevSlug, setPrevSlug] = useState(slug);

  // Reset the search when the scope (location) changes, using the render-time
  // reset pattern React recommends over calling setState inside an effect.
  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setSearchInput("");
    setSearchQuery("");
  }

  // Debounce the input so we hit /api/search at most once per pause in typing.
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const searchActive = searchQuery.length > 0;

  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    viewport?.scrollTo({ top: 0 });
  }, [sortBy, slug, searchActive]);

  return (
    <Sheet
      open={!!location}
      modal={false}
      onOpenChange={(open) => handleOpenChange(open, onClose)}
    >
      <SheetContent
        side="right"
        inert={devPanelOpen ? true : undefined}
        onPointerDownOutside={blockOutsideDismiss}
        onInteractOutside={blockOutsideDismiss}
        onFocusOutside={blockOutsideDismiss}
        className="border-border/60 bg-background/98 flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {location && (
          <>
            <SheetHeader className="shrink-0 border-b pb-4">
              <SheetTitle className="text-lg">{location.name}</SheetTitle>
              <SheetDescription>
                Developers in this scope, ranked by your selected sort
              </SheetDescription>
              {showRegionPicker && slug && (
                <RegionScopeSelect
                  id="dev-region-scope"
                  value={countryWide ? ALL_CHILE_SLUG : slug}
                  facets={facets}
                  onChange={onRegionChange}
                />
              )}
              <LocationPanelStats
                slug={location.slug}
                sortBy={sortBy}
                countryWide={countryWide}
                location={location}
              />
              <div
                className="flex flex-wrap gap-1 pt-2"
                role="group"
                aria-label="Sort developers by"
              >
                {SORT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="xs"
                    variant={sortBy === option.value ? "secondary" : "outline"}
                    aria-pressed={sortBy === option.value}
                    onClick={() => onSortChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="pt-2">
                <div className="relative">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Find your rank — username or name"
                    aria-label="Search developers in this scope by username or name"
                    className="h-8 pr-8 pl-8"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => setSearchInput("")}
                      aria-label="Clear search"
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </SheetHeader>

            <ScrollArea ref={scrollRootRef} className="min-h-0 flex-1">
              {searchActive ? (
                <LocationSearchResults
                  slug={location.slug}
                  countryWide={countryWide}
                  query={searchQuery}
                  scopeName={location.name}
                  onDeveloperSelect={onDeveloperSelect}
                />
              ) : (
                <LocationDevelopersList
                  slug={location.slug}
                  sortBy={sortBy}
                  scrollRootRef={scrollRootRef}
                  countryWide={countryWide}
                  onDeveloperSelect={onDeveloperSelect}
                />
              )}
            </ScrollArea>

            <Separator className="shrink-0" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
