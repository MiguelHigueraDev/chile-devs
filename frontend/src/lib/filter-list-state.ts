import { useState } from "react";

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

export function useStaleWhileRevalidate<T>(items: T[]) {
  const [staleItems, setStaleItems] = useState<T[]>(() =>
    items.length > 0 ? items : [],
  );

  if (items.length > 0 && items !== staleItems) {
    setStaleItems(items);
  }

  const visibleItems = items.length > 0 ? items : staleItems;

  return {
    visibleItems,
    hasStaleFallback: staleItems.length > 0,
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
