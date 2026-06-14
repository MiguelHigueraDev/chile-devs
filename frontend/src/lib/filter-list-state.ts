import { useEffect, useState } from "react";

type FilterListQueryState = {
  isPending: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  data: unknown;
};

export function getFilterListState(query: FilterListQueryState) {
  return {
    showInitialSkeleton: query.isPending && query.data == null,
    isRefreshing: query.isFetching && query.isPlaceholderData,
  };
}

export function useStaleWhileRevalidate<T>(
  items: T[],
  isRevalidating = false,
) {
  const [staleItems, setStaleItems] = useState<T[]>(() =>
    items.length > 0 ? items : [],
  );

  // Cache the last non-empty items for stale-while-revalidate fallback.
  useEffect(() => {
    if (items.length > 0 && items !== staleItems) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop-derived cache after render
      setStaleItems(items);
    }
  }, [items, staleItems]);

  const visibleItems =
    items.length > 0 ? items : isRevalidating ? staleItems : [];

  return {
    visibleItems,
    hasStaleFallback: isRevalidating && staleItems.length > 0,
  };
}

export function getListLoadingPresentation({
  showInitialSkeleton,
  isRefreshing,
  hasStaleFallback,
}: {
  showInitialSkeleton: boolean;
  isRefreshing: boolean;
  hasStaleFallback: boolean;
}) {
  return {
    showFullSkeleton: showInitialSkeleton && !hasStaleFallback,
    isDimmed: isRefreshing || (showInitialSkeleton && hasStaleFallback),
  };
}
