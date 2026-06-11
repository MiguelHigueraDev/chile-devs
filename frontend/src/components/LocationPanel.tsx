import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLocationDevelopers } from "../api/client";
import type { DeveloperSummary, MapLocation } from "../types/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  onClose: () => void;
};

type LocationDevelopersListProps = {
  slug: string;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
};

function LocationDevelopersList({
  slug,
  scrollRootRef,
}: LocationDevelopersListProps) {
  const [developers, setDevelopers] = useState<DeveloperSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    isFetchingRef.current = true;

    fetchLocationDevelopers(slug)
      .then((data) => {
        if (cancelled) return;
        setDevelopers(data.developers);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        if (data.devCount != null) {
          setTotalCount(data.devCount);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load developers",
        );
      })
      .finally(() => {
        if (cancelled) return;
        isFetchingRef.current = false;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loadMore = useCallback(
    async (cursor: string) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoadingMore(true);

      try {
        const data = await fetchLocationDevelopers(slug, { cursor });
        setDevelopers((prev) => {
          const existing = new Set(prev.map((dev) => dev.login));
          const newDevs = data.developers.filter(
            (dev) => !existing.has(dev.login),
          );
          return [...prev, ...newDevs];
        });
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        if (data.devCount != null) {
          setTotalCount(data.devCount);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load developers",
        );
      } finally {
        isFetchingRef.current = false;
        setLoadingMore(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollRoot = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    if (
      !sentinel ||
      !scrollRoot ||
      loading ||
      loadingMore ||
      !hasMore ||
      !nextCursor
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore(nextCursor);
        }
      },
      { root: scrollRoot, rootMargin: "100px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore, nextCursor, scrollRootRef]);

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
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

  if (error) {
    return <p className="text-destructive py-4 text-sm">{error}</p>;
  }

  if (developers.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-sm">
        No developers found for this location.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-border divide-y">
        {developers.map((dev) => (
          <li key={dev.login} className="flex items-center gap-3 py-3">
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
            </div>
            <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
              {dev.contributions.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <div ref={sentinelRef} className="h-px" aria-hidden />
      {loadingMore && (
        <div className="space-y-3 py-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
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
      <p className="text-muted-foreground pt-2 text-xs">
        {hasMore
          ? `Showing ${developers.length.toLocaleString()}${totalCount != null ? ` of ${totalCount.toLocaleString()}` : ""} developers by contributions`
          : totalCount != null
            ? `All ${totalCount.toLocaleString()} developers loaded`
            : `Showing ${developers.length.toLocaleString()} developers by contributions`}
      </p>
    </>
  );
}

export function LocationPanel({ location, onClose }: LocationPanelProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet
      open={!!location}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      modal={false}
    >
      <SheetContent
        side="right"
        className="border-border/60 bg-background/95 w-full backdrop-blur-md sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {location && (
          <>
            <SheetHeader className="border-b pb-4">
              <SheetTitle className="text-lg">{location.name}</SheetTitle>
              <SheetDescription>
                Top contributors in this location
              </SheetDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="secondary">
                  {location.devCount.toLocaleString()} developers
                </Badge>
                <Badge variant="outline">
                  {location.totalContributions.toLocaleString()} contributions
                </Badge>
              </div>
            </SheetHeader>

            <ScrollArea ref={scrollRootRef} className="flex-1 px-4">
              <LocationDevelopersList
                key={location.slug}
                slug={location.slug}
                scrollRootRef={scrollRootRef}
              />
            </ScrollArea>

            <Separator />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
