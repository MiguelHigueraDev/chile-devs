import { useStats } from '../api/queries'
import { createAllChileLocation } from '../lib/all-chile-location'
import type { MapLocation } from '../types/api'
import { SearchBar } from './SearchBar'
import { Button } from '@/components/ui/button'

type StatsHeaderProps = {
  searchQuery: string
  onViewAllDevelopers: (location: MapLocation) => void
  onSearch: (query: string) => void
}

export function StatsHeader({
  searchQuery,
  onViewAllDevelopers,
  onSearch,
}: StatsHeaderProps) {
  const { data: stats } = useStats()

  return (
    <header className="border-border/60 bg-background/80 z-10 flex shrink-0 flex-col gap-2 border-b px-3 py-2 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="min-w-0">
          <h1 className="text-sm leading-tight font-semibold tracking-tight sm:text-base">
            Chile Devs Map
          </h1>
          <p className="text-muted-foreground hidden text-xs leading-tight sm:block">
            GitHub contributions from developers across Chile
          </p>
        </div>
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

      <SearchBar
        key={searchQuery || "empty"}
        query={searchQuery}
        onSearch={onSearch}
        className="w-full sm:max-w-md sm:justify-end"
      />
    </header>
  )
}
