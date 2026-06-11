import { useState } from "react";
import { ChileMap } from "./components/ChileMap";
import { LocationPanel } from "./components/LocationPanel";
import { SearchResultsPanel } from "./components/SearchResultsPanel";
import { StatsFooter } from "./components/StatsFooter";
import { StatsHeader } from "./components/StatsHeader";
import type { MapLocation } from "./types/api";
import { cn } from "@/lib/utils";

function App() {
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState<string | null>(null);

  const panelOpen = selectedLocation || searchQuery;

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
          onViewAllDevelopers={setSelectedLocation}
          onSearch={(query) => {
            setSelectedLocation(null);
            setSearchQuery(query);
          }}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 py-2 sm:px-4">
          <div className="border-border relative min-h-0 flex-1 overflow-hidden rounded-lg border">
            <ChileMap
              onLocationSelect={(location) => {
                setSearchQuery(null);
                setSelectedLocation(location);
              }}
            />
          </div>
          <StatsFooter />
        </div>
      </div>
      <LocationPanel
        location={selectedLocation}
        onClose={() => setSelectedLocation(null)}
      />
      <SearchResultsPanel
        query={searchQuery}
        onClose={() => setSearchQuery(null)}
      />
    </div>
  );
}

export default App;
