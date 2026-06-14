import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapData, useSearchFacets, useStats } from "./api/queries";
import { ChileMap } from "./components/ChileMap";
import { DeveloperProfilePanel } from "./components/DeveloperProfilePanel";
import { LocationPanel } from "./components/LocationPanel";
import { RepoListPanel } from "./components/RepoListPanel";
import { RepoPanel } from "./components/RepoPanel";
import { SearchFilterSheet } from "./components/SearchFilterSheet";
import { SearchResultsPanel } from "./components/SearchResultsPanel";
import { StatsFooter } from "./components/StatsFooter";
import { StatsHeader } from "./components/StatsHeader";
import {
  countActiveSearchFilters,
  isDefaultSearchParams,
  readAppUrlState,
  resolveLocationFromSlug,
  syncAppUrlState,
} from "./lib/app-url-state";
import { ALL_CHILE_SLUG } from "./lib/all-chile-location";
import {
  setDeveloperSortPreference,
  useDeveloperSortPreference,
} from "./lib/developer-sort-preference";
import {
  DEFAULT_SEARCH_PARAMS,
  type MapLocation,
  type MapMode,
  type MapRepo,
  type SearchParams,
} from "./types/api";
import { cn } from "@/lib/utils";

function App() {
  const urlSyncRef = useRef<ReturnType<typeof readAppUrlState> | null>(null);
  const { data: locations = [] } = useMapData();
  const { data: facets } = useSearchFacets();
  const { data: stats } = useStats();
  const [sortBy, setSortBy] = useDeveloperSortPreference();
  const [initialUrlState] = useState(() => readAppUrlState());
  const [mapMode, setMapMode] = useState<MapMode>(
    () => initialUrlState.mapMode,
  );
  const [locationSlug, setLocationSlug] = useState<string | null>(
    () => initialUrlState.locationSlug,
  );
  const [draftFilters, setDraftFilters] = useState<SearchParams>(
    () => initialUrlState.searchParams ?? DEFAULT_SEARCH_PARAMS,
  );
  const [committedFilters, setCommittedFilters] = useState<SearchParams | null>(
    () => initialUrlState.searchParams,
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(
    () => initialUrlState.searchParams != null,
  );
  const [resultsOpen, setResultsOpen] = useState(
    () => initialUrlState.searchParams != null,
  );
  const [devLogin, setDevLogin] = useState<string | null>(
    () => initialUrlState.devLogin,
  );
  const [selectedRepo, setSelectedRepo] = useState<MapRepo | null>(null);
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [viewAllBrowse, setViewAllBrowse] = useState(() => {
    if (initialUrlState.searchParams || !initialUrlState.locationSlug) {
      return false;
    }
    if (initialUrlState.locationSlug === ALL_CHILE_SLUG) {
      return true;
    }
    return initialUrlState.mapMode === "repos";
  });

  const urlSearchParams = useMemo(() => {
    if (locationSlug) {
      return null;
    }

    const source = filterSheetOpen
      ? draftFilters
      : committedFilters;

    if (source == null || isDefaultSearchParams(source)) {
      return null;
    }

    return source;
  }, [committedFilters, draftFilters, filterSheetOpen, locationSlug]);

  const selectedLocation = useMemo(
    () =>
      locationSlug
        ? resolveLocationFromSlug(
            locationSlug,
            locations,
            stats,
            facets?.locations ?? [],
          )
        : null,
    [locationSlug, locations, stats, facets?.locations],
  );

  const activeFilterCount = useMemo(() => {
    const source = filterSheetOpen ? draftFilters : committedFilters;
    if (source == null || isDefaultSearchParams(source)) {
      return 0;
    }
    return countActiveSearchFilters(source);
  }, [committedFilters, draftFilters, filterSheetOpen]);

  const applyUrlState = useCallback(
    (urlState = readAppUrlState()) => {
      if (urlState.sort) {
        setDeveloperSortPreference(urlState.sort);
        setSortBy(urlState.sort);
      }

      if (urlState.searchParams) {
        setMapMode(urlState.mapMode);
        setLocationSlug(null);
        setSelectedRepo(null);
        setDraftFilters(urlState.searchParams);
        setCommittedFilters(urlState.searchParams);
        setFilterSheetOpen(true);
        setResultsOpen(true);
        setDevLogin(urlState.devLogin);
        return;
      }

      setDraftFilters(DEFAULT_SEARCH_PARAMS);
      setCommittedFilters(null);
      setFilterSheetOpen(false);
      setResultsOpen(false);
      setMapMode(urlState.mapMode);
      setLocationSlug(urlState.locationSlug);
      setSelectedRepo(null);
      setViewAllBrowse(
        urlState.searchParams == null &&
          urlState.locationSlug != null &&
          (urlState.locationSlug === ALL_CHILE_SLUG ||
            urlState.mapMode === "repos"),
      );
      setDevLogin(urlState.devLogin);
    },
    [setSortBy],
  );

  useEffect(() => {
    const nextState = {
      locationSlug,
      mapMode,
      searchParams: urlSearchParams,
      sort: locationSlug ? sortBy : null,
      devLogin,
    };
    const prevState = urlSyncRef.current;
    const enteredOrLeftSearch =
      (prevState?.searchParams == null) !== (nextState.searchParams == null);
    const panelChanged =
      prevState?.locationSlug !== nextState.locationSlug || enteredOrLeftSearch;
    const isInitialSync = prevState == null;

    syncAppUrlState(nextState, isInitialSync || !panelChanged);
    urlSyncRef.current = nextState;
  }, [locationSlug, mapMode, urlSearchParams, sortBy, devLogin]);

  useEffect(() => {
    const handlePopState = () => {
      applyUrlState();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyUrlState]);

  const panelOpen =
    selectedLocation ||
    filterSheetOpen ||
    resultsOpen ||
    devLogin ||
    selectedRepo;

  const handleMapModeChange = useCallback((nextMode: MapMode) => {
    setMapMode(nextMode);
    setLocationSlug(null);
    setSelectedRepo(null);
    setViewAllBrowse(false);
    setDraftFilters(DEFAULT_SEARCH_PARAMS);
    setCommittedFilters(null);
    setFilterSheetOpen(false);
    setResultsOpen(false);
  }, []);

  const handleLocationSelect = useCallback((location: MapLocation) => {
    setDraftFilters(DEFAULT_SEARCH_PARAMS);
    setCommittedFilters(null);
    setFilterSheetOpen(false);
    setResultsOpen(false);
    setSelectedRepo(null);
    setViewAllBrowse(false);
    setLocationSlug(location.slug);
  }, []);

  const handleViewAll = useCallback(
    (location: MapLocation) => {
      setDraftFilters(DEFAULT_SEARCH_PARAMS);
      setCommittedFilters(null);
      setFilterSheetOpen(false);
      setResultsOpen(false);
      setSelectedRepo(null);
      setViewAllBrowse(true);
      setLocationSlug(location.slug);
    },
    [],
  );

  const handleRegionChange = useCallback(
    (slug: string) => {
      setViewAllBrowse(true);
      setLocationSlug(slug);
    },
    [],
  );

  const handleRepoSelect = useCallback((repo: MapRepo, keepListOpen = false) => {
    if (!keepListOpen) {
      setLocationSlug(null);
      setViewAllBrowse(false);
      setDraftFilters(DEFAULT_SEARCH_PARAMS);
      setCommittedFilters(null);
      setFilterSheetOpen(false);
      setResultsOpen(false);
    }
    setSelectedRepo(repo);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setLocationSlug(null);
    setDraftFilters(committedFilters ?? DEFAULT_SEARCH_PARAMS);
    setFilterSheetOpen(true);
  }, [committedFilters]);

  const handleCommitSearch = useCallback((params: SearchParams) => {
    setLocationSlug(null);
    setDraftFilters(params);
    setCommittedFilters(
      isDefaultSearchParams(params) ? DEFAULT_SEARCH_PARAMS : params,
    );
    setFilterSheetOpen(true);
    setResultsOpen(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setFilterSheetOpen(false);
    setDraftFilters(DEFAULT_SEARCH_PARAMS);
    setCommittedFilters(null);
    setResultsOpen(false);
  }, []);

  const handleCloseResults = useCallback(() => {
    setResultsOpen(false);
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
          mapMode={mapMode}
          filtersDisabled={mapMode === 'repos'}
          onViewAll={handleViewAll}
          onOpenFilters={handleOpenFilters}
          activeFilterCount={activeFilterCount}
          onOpenMyProfile={(login) => {
            setDevLogin(login);
            setProfileEditMode(false);
          }}
          onEditMyProfile={(login) => {
            setDevLogin(login);
            setProfileEditMode(true);
          }}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 py-2 sm:px-4">
          <div className="border-border relative min-h-0 flex-1 overflow-hidden rounded-lg border">
            <ChileMap
              mode={mapMode}
              onMapModeChange={handleMapModeChange}
              onLocationSelect={handleLocationSelect}
              onRepoSelect={handleRepoSelect}
            />
          </div>
          <StatsFooter />
        </div>
      </div>
      <RepoPanel repo={selectedRepo} onClose={() => setSelectedRepo(null)} />
      {mapMode === "devs" && (
        <LocationPanel
          location={selectedLocation}
          sortBy={sortBy}
          showRegionPicker={viewAllBrowse}
          onSortChange={setSortBy}
          onRegionChange={handleRegionChange}
          onClose={() => {
            setLocationSlug(null);
            setViewAllBrowse(false);
          }}
          onDeveloperSelect={setDevLogin}
          devPanelOpen={!!devLogin}
        />
      )}
      {mapMode === "repos" && (
        <RepoListPanel
          location={selectedLocation}
          showRegionPicker={viewAllBrowse}
          onRegionChange={handleRegionChange}
          onClose={() => {
            setLocationSlug(null);
            setViewAllBrowse(false);
          }}
          onRepoSelect={(repo) => handleRepoSelect(repo, true)}
          repoDetailOpen={selectedRepo != null}
        />
      )}
      <SearchFilterSheet
        open={filterSheetOpen}
        params={draftFilters}
        onChange={setDraftFilters}
        resultsOpen={resultsOpen}
        devPanelOpen={!!devLogin}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseFilters();
          } else {
            setFilterSheetOpen(true);
          }
        }}
        onApply={handleCommitSearch}
      />
      <SearchResultsPanel
        open={resultsOpen}
        params={committedFilters}
        onClose={handleCloseResults}
        onEditFilters={() => {
          setResultsOpen(false);
          setFilterSheetOpen(true);
        }}
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
