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
