import { useEffect, useMemo, useRef } from "react";
import { useCountryDevelopers, useLocationDevelopers } from "../api/queries";
import { isAllChileLocation } from "../lib/all-chile-location";
import { useStackedSheetDismissGuard } from "../lib/stacked-sheet-dismiss";
import { formatNumber } from "../lib/utils";
import type { DeveloperSortKey, MapLocation } from "../types/api";
import { DeveloperList } from "./DeveloperList";
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
  onSortChange: (sort: DeveloperSortKey) => void;
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
  { value: "contributions", label: "Contributions (last year)" },
  { value: "followers", label: "Followers" },
  { value: "stars", label: "Stars" },
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
  } = countryWide ? countryQuery : locationQuery;
  const sentinelRef = useRef<HTMLDivElement>(null);

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
      isPending ||
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
  }, [fetchNextPage, hasMore, isFetchingNextPage, isPending, scrollRootRef]);

  if (isPending) {
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
    <>
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
    </>
  );
}

export function LocationPanel({
  location,
  sortBy,
  onSortChange,
  onClose,
  onDeveloperSelect,
  devPanelOpen = false,
}: LocationPanelProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const slug = location?.slug ?? null;
  const countryWide = location ? isAllChileLocation(location) : false;
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
                {countryWide
                  ? "All developers in Chile"
                  : "Top developers in this location"}
              </SheetDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="secondary">
                  {formatNumber(location.devCount)} developers
                </Badge>
                <Badge variant="outline">
                  {formatNumber(location.totalContributions)} contributions
                </Badge>
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
                key={`${location.slug}-${sortBy}`}
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
