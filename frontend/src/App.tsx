import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapData, useStats } from "./api/queries";
import { ChileMap } from "./components/ChileMap";
import { DeveloperProfilePanel } from "./components/DeveloperProfilePanel";
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
import { useSearchHistory } from "./lib/search-history";
import type { MapLocation } from "./types/api";
import { cn } from "@/lib/utils";

function App() {
  const urlSyncRef = useRef<ReturnType<typeof readAppUrlState> | null>(null);
  const { data: locations = [] } = useMapData();
  const { data: stats } = useStats();
  const [sortBy, setSortBy] = useDeveloperSortPreference();
  const {
    entries: recentSearches,
    add: addRecentSearch,
    remove: removeRecentSearch,
    clear: clearRecentSearches,
  } = useSearchHistory();
  const [locationSlug, setLocationSlug] = useState<string | null>(() => {
    const urlState = readAppUrlState();
    return urlState.searchQuery ? null : urlState.locationSlug;
  });
  const [searchInput, setSearchInput] = useState(
    () => readAppUrlState().searchQuery ?? "",
  );
  const [activeSearchQuery, setActiveSearchQuery] = useState<string | null>(
    () => readAppUrlState().searchQuery,
  );
  const [devLogin, setDevLogin] = useState<string | null>(
    () => readAppUrlState().devLogin,
  );
  const [profileEditMode, setProfileEditMode] = useState(false);

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
        setSearchInput(urlState.searchQuery);
        setActiveSearchQuery(urlState.searchQuery);
        setDevLogin(urlState.devLogin);
        return;
      }

      setActiveSearchQuery(null);
      setSearchInput("");
      setLocationSlug(urlState.locationSlug);
      setDevLogin(urlState.devLogin);
    },
    [setSortBy],
  );

  useEffect(() => {
    const nextState = {
      locationSlug,
      searchQuery: activeSearchQuery,
      sort: locationSlug ? sortBy : null,
      devLogin,
    };
    const prevState = urlSyncRef.current;
    const panelChanged =
      prevState?.locationSlug !== nextState.locationSlug ||
      prevState?.searchQuery !== nextState.searchQuery;
    const isInitialSync = prevState == null;

    syncAppUrlState(nextState, isInitialSync || !panelChanged);
    urlSyncRef.current = nextState;
  }, [locationSlug, activeSearchQuery, sortBy, devLogin]);

  useEffect(() => {
    const handlePopState = () => {
      applyUrlState();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyUrlState]);

  const panelOpen = selectedLocation || activeSearchQuery || devLogin;

  const handleLocationSelect = useCallback((location: MapLocation) => {
    setActiveSearchQuery(null);
    setSearchInput("");
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
          searchQuery={searchInput}
          onSearchQueryChange={setSearchInput}
          onViewAllDevelopers={handleLocationSelect}
          onSearch={(query) => {
            setLocationSlug(null);
            setSearchInput(query);
            setActiveSearchQuery(query);
            addRecentSearch(query);
          }}
          onOpenMyProfile={(login) => {
            setDevLogin(login);
            setProfileEditMode(false);
          }}
          onEditMyProfile={(login) => {
            setDevLogin(login);
            setProfileEditMode(true);
          }}
          recentSearches={recentSearches}
          onRemoveRecentSearch={removeRecentSearch}
          onClearRecentSearches={clearRecentSearches}
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
        onDeveloperSelect={setDevLogin}
        devPanelOpen={!!devLogin}
      />
      <SearchResultsPanel
        query={activeSearchQuery}
        sortBy={sortBy}
        onClose={() => setActiveSearchQuery(null)}
        onDeveloperSelect={setDevLogin}
        devPanelOpen={!!devLogin}
      />
      <DeveloperProfilePanel
        login={devLogin}
        editMode={profileEditMode}
        onEditModeChange={setProfileEditMode}
        onClose={() => {
          setDevLogin(null);
          setProfileEditMode(false);
        }}
      />
    </div>
  );
}

export default App;
