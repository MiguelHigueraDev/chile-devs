import { useStats } from "../api/queries";
import { formatNumber } from "../lib/utils";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const METRICS = [
  { key: "totalDevs" as const, label: "developers" },
  { key: "totalContributions" as const, label: "contributions (last year)" },
  { key: "locationsWithDevs" as const, label: "locations" },
];

export function StatsFooter() {
  const { data: stats, error, isPending } = useStats();

  if (error) {
    return (
      <footer className="text-destructive shrink-0 px-1 py-1 text-center text-[10px]">
        {error.message}
      </footer>
    );
  }

  if (isPending && !stats) {
    return (
      <footer className="flex shrink-0 items-center justify-center gap-3 py-1">
        {METRICS.map((metric) => (
          <Skeleton key={metric.key} className="h-3 w-24" />
        ))}
      </footer>
    );
  }

  if (!stats) return null;

  return (
    <footer className="text-muted-foreground flex shrink-0 items-center justify-center gap-2 px-1 py-1 text-[10px] tabular-nums sm:gap-3 sm:text-[11px]">
      {METRICS.map((metric, index) => (
        <div key={metric.key} className="flex items-center gap-2 sm:gap-3">
          {index > 0 && (
            <Separator orientation="vertical" className="hidden h-3 sm:block" />
          )}
          <span>
            <span className="text-foreground font-medium">
              {formatNumber(stats[metric.key])}
            </span>{" "}
            {metric.label}
          </span>
        </div>
      ))}
    </footer>
  );
}
