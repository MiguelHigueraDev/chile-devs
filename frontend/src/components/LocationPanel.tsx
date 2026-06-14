import { useEffect, useMemo, useRef } from "react";
import { useCountryDevelopers, useLocationDevelopers, useSearchFacets } from "../api/queries";
import { ALL_CHILE_SLUG, isAllChileLocation } from "../lib/all-chile-location";
import { getFilterListState } from "../lib/filter-list-state";
import { useStackedSheetDismissGuard } from "../lib/stacked-sheet-dismiss";
import { cn, formatNumber } from "../lib/utils";
import { RANK_SORT_LABEL } from "../lib/rank";
import type { DeveloperSortKey, MapLocation } from "../types/api";
import { DeveloperList } from "./DeveloperList";
import { RegionScopeSelect } from "./RegionScopeSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollRoot = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    if (
      !sentinel ||
      !scrollRoot ||
      showInitialSkeleton ||
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
  }, [fetchNextPage, hasMore, isFetchingNextPage, showInitialSkeleton, scrollRootRef]);

  if (showInitialSkeleton) {
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

  if (error && developers.length === 0) {
    return (
      <p className="text-destructive px-4 py-4 text-sm">{error.message}</p>
    );
  }

  if (developers.length === 0) {
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
        isRefreshing && "pointer-events-none opacity-60",
      )}
    >
      <DeveloperList
        developers={developers}
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
          ? `Showing ${formatNumber(developers.length)}${totalCount != null ? ` of ${formatNumber(totalCount)}` : ""} developers`
          : totalCount != null
            ? `All ${formatNumber(totalCount)} developers loaded`
            : `Showing ${formatNumber(developers.length)} developers`}
      </p>
    </div>
  );
}

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
  const locationQuery = useLocationDevelopers(
    slug ?? "",
    sortBy,
    !!slug && !countryWide,
  );
  const countryQuery = useCountryDevelopers(sortBy, !!slug && countryWide);
  const activeQuery = countryWide ? countryQuery : locationQuery;
  const { showInitialSkeleton, isRefreshing } =
    getFilterListState(activeQuery);
  const devCount =
    activeQuery.data?.pages.find((page) => page.devCount != null)?.devCount ??
    null;
  const totalContributions =
    activeQuery.data?.pages.find((page) => page.totalContributions != null)
      ?.totalContributions ?? null;
  const { handleOpenChange, blockOutsideDismiss } =
    useStackedSheetDismissGuard(devPanelOpen);

  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    viewport?.scrollTo({ top: 0 });
  }, [sortBy, slug]);

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
              <div className="flex min-h-[26px] flex-wrap gap-2 pt-2">
                {showInitialSkeleton || isRefreshing ? (
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
                      {formatNumber(
                        totalContributions ?? location.totalContributions,
                      )}{" "}
                      contributions
                    </Badge>
                  </>
                )}
              </div>
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
            </SheetHeader>

            <ScrollArea ref={scrollRootRef} className="min-h-0 flex-1">
              <LocationDevelopersList
                slug={location.slug}
                sortBy={sortBy}
                scrollRootRef={scrollRootRef}
                countryWide={countryWide}
                onDeveloperSelect={onDeveloperSelect}
              />
            </ScrollArea>

            <Separator className="shrink-0" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
