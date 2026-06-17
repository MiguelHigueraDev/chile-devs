import type { RepoCommitActivity } from "../types/api";
import { formatWeekTooltip } from "../lib/contribution-levels";
import { formatNumber } from "../lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type RepoCommitActivityProps = {
  activity?: RepoCommitActivity;
  isPending?: boolean;
  error?: Error | null;
};

function RepoCommitActivitySkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function formatDateRange(
  firstWeek: string,
  lastWeek: string,
): string {
  const start = new Date(`${firstWeek}T00:00:00`);
  const end = new Date(`${lastWeek}T00:00:00`);
  end.setDate(end.getDate() + 6);

  const sameYear = start.getFullYear() === end.getFullYear();

  const optsStart: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  };

  const optsEnd: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  return `${start.toLocaleDateString(undefined, optsStart)} – ${end.toLocaleDateString(undefined, optsEnd)}`;
}

export function RepoCommitActivityChart({
  activity,
  isPending,
  error,
}: RepoCommitActivityProps) {
  if (isPending) {
    return <RepoCommitActivitySkeleton />;
  }

  if (error || !activity) {
    return (
      <p className="text-muted-foreground text-sm">
        {error?.message ?? "Commit activity unavailable."}
      </p>
    );
  }

  const hasCommitActivity = activity.weeks.some((week) => week.total > 0);

  if (!hasCommitActivity) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Commit activity
        </p>
        <p className="text-muted-foreground flex h-24 items-center justify-center text-sm">
          No recent commit activity.
        </p>
      </div>
    );
  }

  const totalCommits = activity.weeks.reduce((sum, w) => sum + w.total, 0);
  const firstWeek = activity.weeks[0].weekStart;
  const lastWeek = activity.weeks[activity.weeks.length - 1].weekStart;
  const dateRange = formatDateRange(firstWeek, lastWeek);
  const maxTotal = Math.max(...activity.weeks.map((week) => week.total), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Commit activity
        </p>
        <p className="text-muted-foreground text-[10px] tabular-nums">
          {formatNumber(totalCommits)} in the last year
        </p>
      </div>

      <div className="overflow-x-auto pb-1">
        <TooltipProvider>
          <div className="flex h-24 min-w-full items-end gap-[3px]">
            {activity.weeks.map((week) => {
              const heightPct =
                week.total > 0 ? Math.max((week.total / maxTotal) * 100, 4) : 0;

              return (
                <Tooltip key={week.weekStart}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="border-0 bg-emerald-500/80 p-0 dark:bg-emerald-400/70 hover:bg-emerald-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-emerald-300 min-w-[6px] flex-1 rounded-sm motion-safe:transition-colors"
                      style={{ height: `${heightPct}%` }}
                      aria-label={formatWeekTooltip(week.weekStart, week.total)}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {formatWeekTooltip(week.weekStart, week.total)}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>

      <p className="text-muted-foreground text-[10px] tabular-nums text-right">
        {dateRange}
      </p>
    </div>
  );
}
