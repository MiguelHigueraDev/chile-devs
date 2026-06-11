import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCountryDevelopers, useLocationDevelopers } from "../api/queries";
import { isAllChileLocation } from "../lib/all-chile-location";
import { formatNumber } from "../lib/utils";
import type {
  DeveloperSortKey,
  DeveloperSummary,
  MapLocation,
} from "../types/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TopLanguagesBar } from "./TopLanguagesBar";
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
import { cn } from "@/lib/utils";

type LocationPanelProps = {
  location: MapLocation | null;
  onClose: () => void;
};

type LocationDevelopersListProps = {
  slug: string;
  sortBy: DeveloperSortKey;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  countryWide?: boolean;
};

const SORT_OPTIONS: Array<{ value: DeveloperSortKey; label: string }> = [
  { value: "contributions", label: "Contributions" },
  { value: "followers", label: "Followers" },
  { value: "stars", label: "Stars" },
];

const SORT_LABELS: Record<DeveloperSortKey, string> = {
  contributions: "contributions",
  followers: "followers",
  stars: "stars",
};

const PODIUM_ROW_STYLES: Record<1 | 2 | 3, string> = {
  1: "bg-amber-400/18",
  2: "bg-neutral-300/12",
  3: "bg-orange-600/18",
};

function getDeveloperMetric(
  dev: DeveloperSummary,
  sortBy: DeveloperSortKey,
): number {
  if (sortBy === "followers") {
    return dev.followers;
  }
  if (sortBy === "stars") {
    return dev.totalStars;
  }
  return dev.contributions;
}

function LocationDevelopersList({
  slug,
  sortBy,
  scrollRootRef,
  countryWide = false,
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

  const sortLabel = SORT_LABELS[sortBy];

  return (
    <>
      <ul>
        {developers.map((dev, index) => {
          const rank = index + 1;
          const podiumStyle =
            rank <= 3 ? PODIUM_ROW_STYLES[rank as 1 | 2 | 3] : undefined;

          return (
            <li
              key={dev.login}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                podiumStyle,
                rank > 3 && "border-border border-t",
              )}
            >
              <span
                className={cn(
                  "w-7 shrink-0 text-center text-sm tabular-nums",
                  rank <= 3
                    ? "text-foreground font-bold"
                    : "text-muted-foreground font-medium",
                )}
                aria-label={`Rank ${rank}`}
              >
                {rank}
              </span>
              <Avatar className="size-8">
                <AvatarImage src={dev.avatarUrl} alt={dev.login} />
                <AvatarFallback>
                  {dev.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <a
                  href={dev.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:text-foreground/80 inline-flex items-center gap-1 text-sm font-medium transition-colors"
                >
                  {dev.login}
                  <ExternalLink className="size-3 opacity-60" />
                </a>
                {dev.name && (
                  <p className="text-muted-foreground truncate text-xs">
                    {dev.name}
                  </p>
                )}
                {dev.topLanguages.length > 0 && (
                  <TopLanguagesBar
                    languages={dev.topLanguages}
                    className="mt-1.5"
                  />
                )}
              </div>
              <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
                {formatNumber(getDeveloperMetric(dev, sortBy))}
              </span>
            </li>
          );
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
      <p className="text-muted-foreground px-4 pt-2 text-xs">
        {hasMore
          ? `Showing ${formatNumber(developers.length)}${totalCount != null ? ` of ${formatNumber(totalCount)}` : ""} developers by ${sortLabel}`
          : totalCount != null
            ? `All ${formatNumber(totalCount)} developers loaded`
            : `Showing ${formatNumber(developers.length)} developers by ${sortLabel}`}
      </p>
    </>
  );
}

export function LocationPanel({ location, onClose }: LocationPanelProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const slug = location?.slug ?? null;
  const countryWide = location ? isAllChileLocation(location) : false;
  const [sortBy, setSortBy] = useState<DeveloperSortKey>("contributions");
  const [prevSlug, setPrevSlug] = useState<string | null>(slug);

  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setSortBy("contributions");
  }

  // Scroll to top when sortBy or slug changes
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
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
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
                    onClick={() => setSortBy(option.value)}
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
              />
            </ScrollArea>

            <Separator className="shrink-0" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
