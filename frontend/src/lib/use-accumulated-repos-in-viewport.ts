import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { reposInViewportQueryOptions } from "../api/queries";
import type { MapRepo } from "../types/api";
import {
  clipViewportToChile,
  filterReposInViewport,
  formatViewportBbox,
  mergeReposIntoMap,
  parseViewportBbox,
  type ViewportBbox,
  isViewportBboxCovered,
} from "./viewport-bbox";

const accumulatedRepoCache = new Map<string, MapRepo>();
const accumulatedFetchedBboxes: ViewportBbox[] = [];
const cacheResetListeners = new Set<() => void>();

export function resetAccumulatedReposCache(): void {
  accumulatedRepoCache.clear();
  accumulatedFetchedBboxes.length = 0;
  for (const listener of cacheResetListeners) {
    listener();
  }
}

export function useAccumulatedReposInViewport(
  viewportBbox: string | null,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const [cacheRevision, setCacheRevision] = useState(0);

  const parsedViewport = useMemo(
    () => (viewportBbox ? parseViewportBbox(viewportBbox) : null),
    [viewportBbox],
  );

  const chileViewport = useMemo(
    () => (parsedViewport ? clipViewportToChile(parsedViewport) : null),
    [parsedViewport],
  );

  useEffect(() => {
    const handleCacheReset = () => {
      setCacheRevision((revision) => revision + 1);
    };

    cacheResetListeners.add(handleCacheReset);
    return () => {
      cacheResetListeners.delete(handleCacheReset);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !chileViewport) {
      return;
    }

    if (isViewportBboxCovered(chileViewport, accumulatedFetchedBboxes)) {
      return;
    }

    let cancelled = false;

    const fetchBbox = formatViewportBbox(chileViewport);

    void queryClient
      .fetchQuery(reposInViewportQueryOptions(fetchBbox))
      .then((repos) => {
        if (cancelled) return;

        mergeReposIntoMap(accumulatedRepoCache, repos);
        accumulatedFetchedBboxes.push(chileViewport);
        setCacheRevision((revision) => revision + 1);
      })
      .catch(() => {
        if (cancelled) return;

        accumulatedFetchedBboxes.push(chileViewport);
        setCacheRevision((revision) => revision + 1);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, chileViewport, queryClient, cacheRevision]);

  const isFetching = useMemo(() => {
    void cacheRevision;

    if (!enabled || !chileViewport) {
      return false;
    }

    return !isViewportBboxCovered(chileViewport, accumulatedFetchedBboxes);
  }, [enabled, chileViewport, cacheRevision]);

  const repos = useMemo(() => {
    void cacheRevision;

    if (!parsedViewport || !chileViewport) {
      return [];
    }

    return filterReposInViewport(accumulatedRepoCache.values(), parsedViewport);
  }, [parsedViewport, chileViewport, cacheRevision]);

  return {
    data: repos,
    isFetching,
    hasChileIntersection: chileViewport != null,
  };
}
