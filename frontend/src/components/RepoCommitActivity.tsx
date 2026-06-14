import type { RepoCommitActivity } from "../types/api";
import { formatWeekTooltip } from "../lib/contribution-levels";
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

  const maxTotal = Math.max(...activity.weeks.map((week) => week.total), 1);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Commit activity
      </p>

      <div className="overflow-x-auto pb-1">
        <TooltipProvider>
          <div className="flex h-24 min-w-full items-end gap-[3px]">
            {activity.weeks.map((week) => {
              const heightPct = Math.max((week.total / maxTotal) * 100, 4);

              return (
                <Tooltip key={week.weekStart}>
                  <TooltipTrigger asChild>
                    <div
                      className="bg-emerald-500/80 dark:bg-emerald-400/70 hover:bg-emerald-600 dark:hover:bg-emerald-300 min-w-[6px] flex-1 rounded-sm motion-safe:transition-colors"
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
    </div>
  );
}
