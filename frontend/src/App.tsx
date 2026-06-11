import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapData, useStats } from "./api/queries";
import { ChileMap } from "./components/ChileMap";
import { LocationPanel } from "./components/LocationPanel";
import { SearchResultsPanel } from "./components/SearchResultsPanel";
import { StatsFooter } from "./components/StatsFooter";
import { StatsHeader } from "./components/StatsHeader";
import {
  readAppUrlState,
  resolveLocationFromSlug,
  syncAppUrlState,
} from "./lib/app-url-state";
import {
  setDeveloperSortPreference,
  useDeveloperSortPreference,
} from "./lib/developer-sort-preference";
import type { MapLocation } from "./types/api";
import { cn } from "@/lib/utils";

function App() {
  const urlSyncRef = useRef<ReturnType<typeof readAppUrlState> | null>(null);
  const { data: locations = [] } = useMapData();
  const { data: stats } = useStats();
  const [sortBy, setSortBy] = useDeveloperSortPreference();
  const [locationSlug, setLocationSlug] = useState<string | null>(() => {
    const urlState = readAppUrlState();
    return urlState.searchQuery ? null : urlState.locationSlug;
  });
  const [searchQuery, setSearchQuery] = useState<string | null>(
    () => readAppUrlState().searchQuery,
  );

  const selectedLocation = useMemo(
    () =>
      locationSlug
        ? resolveLocationFromSlug(locationSlug, locations, stats)
        : null,
    [locationSlug, locations, stats],
  );

  const applyUrlState = useCallback(
    (urlState = readAppUrlState()) => {
      if (urlState.sort) {
        setDeveloperSortPreference(urlState.sort);
        setSortBy(urlState.sort);
      }

      if (urlState.searchQuery) {
        setLocationSlug(null);
        setSearchQuery(urlState.searchQuery);
        return;
      }

      setSearchQuery(null);
      setLocationSlug(urlState.locationSlug);
    },
    [setSortBy],
  );

  useEffect(() => {
    const nextState = {
      locationSlug,
      searchQuery,
      sort: locationSlug ? sortBy : null,
    };
    const prevState = urlSyncRef.current;
    const panelChanged =
      prevState?.locationSlug !== nextState.locationSlug ||
      prevState?.searchQuery !== nextState.searchQuery;
    const isInitialSync = prevState == null;

    syncAppUrlState(nextState, isInitialSync || !panelChanged);
    urlSyncRef.current = nextState;
  }, [locationSlug, searchQuery, sortBy]);

  useEffect(() => {
    const handlePopState = () => {
      applyUrlState();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyUrlState]);

  const panelOpen = selectedLocation || searchQuery;

  const handleLocationSelect = useCallback((location: MapLocation) => {
    setSearchQuery(null);
    setLocationSlug(location.slug);
  }, []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div
        inert={panelOpen ? true : undefined}
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-[filter] duration-500 ease-in-out motion-reduce:transition-none",
          panelOpen && "pointer-events-none blur-[2px] brightness-[0.94]",
        )}
      >
        <StatsHeader
          searchQuery={searchQuery ?? ""}
          onViewAllDevelopers={handleLocationSelect}
          onSearch={(query) => {
            setLocationSlug(null);
            setSearchQuery(query);
          }}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 py-2 sm:px-4">
          <div className="border-border relative min-h-0 flex-1 overflow-hidden rounded-lg border">
            <ChileMap onLocationSelect={handleLocationSelect} />
          </div>
          <StatsFooter />
        </div>
      </div>
      <LocationPanel
        location={selectedLocation}
        sortBy={sortBy}
        onSortChange={setSortBy}
        onClose={() => setLocationSlug(null)}
      />
      <SearchResultsPanel
        query={searchQuery}
        sortBy={sortBy}
        onClose={() => setSearchQuery(null)}
      />
    </div>
  );
}

export default App;
