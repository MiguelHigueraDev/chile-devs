import { useStats } from '../api/queries'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

const METRICS = [
  { key: 'totalDevs' as const, label: 'Developers' },
  { key: 'totalContributions' as const, label: 'Contributions (1y)' },
  { key: 'locationsWithDevs' as const, label: 'Locations' },
  { key: 'countryLevelDevs' as const, label: 'Country-level only', muted: true },
]

export function StatsHeader() {
  const { data: stats, error, isPending } = useStats()

  return (
    <header className="border-border/60 bg-background/80 z-10 flex shrink-0 flex-col items-start justify-between gap-4 border-b px-4 py-4 backdrop-blur-md sm:flex-row sm:items-center sm:gap-6 sm:px-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">
          Chile Devs Map
        </h1>
        <p className="text-muted-foreground text-sm">
          GitHub contributions from developers across Chile
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:gap-6">
        {error && (
          <span className="text-destructive text-sm">{error.message}</span>
        )}

        {isPending && !error && (
          <div className="flex items-center gap-4">
            {METRICS.map((metric) => (
              <div key={metric.key} className="flex flex-col items-end gap-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        )}

        {stats &&
          METRICS.map((metric, index) => (
            <div key={metric.key} className="flex items-center gap-4 sm:gap-6">
              {index > 0 && (
                <Separator
                  orientation="vertical"
                  className="hidden h-8 sm:block"
                />
              )}
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className={
                    metric.muted
                      ? 'text-muted-foreground text-base font-semibold tabular-nums'
                      : 'text-base font-semibold tabular-nums'
                  }
                >
                  {stats[metric.key].toLocaleString()}
                </span>
                <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
                  {metric.label}
                </span>
              </div>
            </div>
          ))}
      </div>
    </header>
  )
}
