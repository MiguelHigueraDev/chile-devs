import { ExternalLink, Star } from "lucide-react";
import { useGithubStars, useStats } from "../api/queries";
import { GITHUB_REPO_SLUG, GITHUB_REPO_URL } from "../lib/github";
import { cn, formatDateTime, formatNumber } from "../lib/utils";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const METRICS = [
  { key: "totalDevs" as const, label: "developers" },
  { key: "totalContributions" as const, label: "contributions (last year)" },
  { key: "locationsWithDevs" as const, label: "locations" },
] as const;

function LastSynced({
  at,
  location,
}: {
  at: string;
  location: string | null;
}) {
  return (
    <span>
      Last synced:
      {location && (
        <>
          {" "}
          <span className="text-foreground font-medium">{location}</span>
          {" · "}
        </>
      )}
      {!location && " "}
      {formatDateTime(at)}
    </span>
  );
}

function MetricItem({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <span>
      <span className="text-foreground font-medium">{formatNumber(value)}</span>{" "}
      {label}
    </span>
  );
}

function GithubLink() {
  const { data: stars, isPending } = useGithubStars();

  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
    >
      <span className="truncate">{GITHUB_REPO_SLUG}</span>
      {(isPending || stars != null) && (
        <>
          <Separator orientation="vertical" className="hidden h-3 sm:block" />
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-3 shrink-0" />
            {isPending ? (
              <Skeleton className="inline-block h-3 w-6" />
            ) : (
              <span className="text-foreground font-medium">
                {formatNumber(stars!)}
              </span>
            )}
          </span>
        </>
      )}
      <ExternalLink className="size-3 shrink-0 opacity-60" />
    </a>
  );
}

const footerGridClass =
  "grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center";

function GithubColumn({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "col-span-2 flex justify-end sm:col-span-1 sm:col-start-3",
        className,
      )}
    >
      <GithubLink />
    </div>
  );
}

export function StatsFooter() {
  const { data: stats, error, isPending } = useStats();

  if (error) {
    return (
      <footer className="text-destructive shrink-0 px-1 py-1 text-[10px] sm:text-[11px]">
        <div className={footerGridClass}>
          <div className="col-span-2 sm:col-span-1 sm:col-start-1 sm:text-left">
            {error.message}
          </div>
          <GithubColumn />
        </div>
      </footer>
    );
  }

  if (isPending && !stats) {
    return (
      <footer className="relative shrink-0 px-1 py-1">
        <div className={footerGridClass}>
          <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:flex sm:justify-center sm:gap-3">
            {METRICS.map((metric) => (
              <Skeleton key={metric.key} className="h-3 w-24" />
            ))}
          </div>
          <GithubColumn />
        </div>
      </footer>
    );
  }

  if (!stats) return null;

  const metricsWrapperClass =
    "col-span-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:col-span-1 sm:col-start-2 sm:flex sm:items-center sm:justify-center sm:gap-3";

  return (
    <footer className="text-muted-foreground relative shrink-0 px-1 py-1 text-[10px] tabular-nums sm:text-[11px]">
      <div className={footerGridClass}>
        {stats.lastUpdate && (
          <div className="col-span-2 sm:col-span-1 sm:col-start-1">
            <LastSynced
              at={stats.lastUpdate.at}
              location={stats.lastUpdate.location}
            />
          </div>
        )}

        <div className={metricsWrapperClass}>
          {METRICS.map((metric, index) => (
            <div
              key={metric.key}
              className={cn(
                "justify-self-center text-center",
                index === METRICS.length - 1 &&
                  METRICS.length % 2 !== 0 &&
                  "col-span-2 sm:col-span-1",
              )}
            >
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {index > 0 && (
                  <Separator
                    orientation="vertical"
                    className="hidden h-3 sm:block"
                  />
                )}
                <MetricItem value={stats[metric.key]} label={metric.label} />
              </div>
            </div>
          ))}
        </div>

        <GithubColumn />
      </div>
    </footer>
  );
}
