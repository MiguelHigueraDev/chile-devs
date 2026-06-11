import { useStats } from '../api/queries'
import { createAllChileLocation } from '../lib/all-chile-location'
import type { MapLocation } from '../types/api'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

const METRICS = [
  { key: 'totalDevs' as const, label: 'Developers' },
  { key: 'totalContributions' as const, label: 'Contributions (1y)' },
  { key: 'locationsWithDevs' as const, label: 'Locations' },
]

type StatsHeaderProps = {
  onViewAllDevelopers: (location: MapLocation) => void
}

export function StatsHeader({ onViewAllDevelopers }: StatsHeaderProps) {
  const { data: stats, error, isPending } = useStats()

  return (
    <header className="border-border/60 bg-background/80 z-10 flex shrink-0 flex-col items-start justify-between gap-2 border-b px-3 py-2 backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:px-4">
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

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-4">
        {error && (
          <span className="text-destructive text-xs">{error.message}</span>
        )}

        {isPending && !error && (
          <div className="flex items-center gap-3">
            {METRICS.map((metric) => (
              <div key={metric.key} className="flex flex-col items-end gap-0.5">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            ))}
          </div>
        )}

        {stats &&
          METRICS.map((metric, index) => (
            <div key={metric.key} className="flex items-center gap-3 sm:gap-4">
              {index > 0 && (
                <Separator
                  orientation="vertical"
                  className="hidden h-6 sm:block"
                />
              )}
              <div className="flex flex-col items-end gap-0">
                <span className="text-sm font-semibold tabular-nums">
                  {stats[metric.key].toLocaleString()}
                </span>
                <span className="text-muted-foreground text-[9px] tracking-wider uppercase">
                  {metric.label}
                </span>
              </div>
            </div>
          ))}
      </div>
    </header>
  )
}
