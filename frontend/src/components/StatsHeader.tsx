import { useStats } from '../api/queries'
import { createAllChileLocation } from '../lib/all-chile-location'
import type { MapLocation } from '../types/api'
import { SearchBar } from './SearchBar'
import { Button } from '@/components/ui/button'

type StatsHeaderProps = {
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onViewAllDevelopers: (location: MapLocation) => void
  onSearch: (query: string) => void
}

export function StatsHeader({
  searchQuery,
  onSearchQueryChange,
  onViewAllDevelopers,
  onSearch,
}: StatsHeaderProps) {
  const { data: stats } = useStats()

  return (
    <header className="border-border/60 bg-background/80 z-10 flex shrink-0 flex-col gap-3 border-b px-3 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm leading-none font-semibold tracking-tight sm:text-base">
            Chile Devs Map
          </h1>
          {stats && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-xs"
              onClick={() => onViewAllDevelopers(createAllChileLocation(stats))}
            >
              View all
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mt-1 hidden text-xs leading-none sm:block">
          GitHub contributions from developers across Chile
        </p>
      </div>

      <SearchBar
        query={searchQuery}
        onQueryChange={onSearchQueryChange}
        onSearch={onSearch}
        className="w-full sm:max-w-md sm:shrink-0"
      />
    </header>
  )
}
