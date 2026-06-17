import { useEffect, useRef, useState } from "react";
import type { ContributionActivity, ContributionDay } from "../types/api";
import { formatNumber } from "../lib/utils";
import {
  getContributionLevel,
  getContributionLevelClass,
} from "../lib/contribution-levels";
import { Skeleton } from "@/components/ui/skeleton";

type ContributionGraphProps = {
  activity?: ContributionActivity;
  isPending?: boolean;
  error?: Error | null;
};

type GridCell = ContributionDay | null;

const WEEKDAY_LABELS: Array<{ row: number; label: string }> = [
  { row: 1, label: "Mon" },
  { row: 3, label: "Wed" },
  { row: 5, label: "Fri" },
];

function buildGrid(weeks: ContributionDay[][]): GridCell[][] {
  const columnCount = weeks.length;
  const grid: GridCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: columnCount }, () => null),
  );

  weeks.forEach((week, weekIndex) => {
    week.forEach((day, dayIndex) => {
      if (dayIndex < 7) {
        grid[dayIndex][weekIndex] = day;
      }
    });
  });

  return grid;
}

function buildMonthSegments(
  weeks: ContributionDay[][],
): Array<{ label: string; startWeek: number }> {
  const segments: Array<{ label: string; startWeek: number }> = [];
  let lastMonth = -1;

  weeks.forEach((week, weekIndex) => {
    const firstDay = week.find((day) => day.date);
    if (!firstDay) {
      return;
    }

    const date = new Date(`${firstDay.date}T00:00:00`);
    const month = date.getMonth();
    if (month === lastMonth) {
      return;
    }

    lastMonth = month;
    segments.push({
      label: date.toLocaleDateString(undefined, { month: "short" }),
      startWeek: weekIndex,
    });
  });

  return segments;
}

const CELL_SIZE = 11;
const CELL_GAP = 3;
const WEEKDAY_COLUMN_WIDTH = 28;

function weekColumnOffset(weekIndex: number, cellSize: number): number {
  return weekIndex * (cellSize + CELL_GAP);
}

function useScaleToFit(contentWidth: number, contentHeight: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() =>
    contentWidth > 0 ? Math.min(1, 384 / contentWidth) : 1,
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || contentWidth <= 0) {
      return;
    }

    const update = () => {
      const width = el.getBoundingClientRect().width;
      setScale(width > 0 ? Math.min(1, width / contentWidth) : 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentWidth]);

  return {
    containerRef,
    scale,
    scaledWidth: contentWidth * scale,
    scaledHeight: contentHeight * scale,
  };
}

function ContributionGraphSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-[88px] w-full" />
    </div>
  );
}

function ContributionGraphContent({
  activity,
}: {
  activity: ContributionActivity;
}) {
  const grid = buildGrid(activity.weeks);
  const monthSegments = buildMonthSegments(activity.weeks);
  const columnCount = activity.weeks.length;
  const gridWidth =
    columnCount * CELL_SIZE + Math.max(0, columnCount - 1) * CELL_GAP;
  const naturalWidth = WEEKDAY_COLUMN_WIDTH + gridWidth;
  const naturalHeight = 16 + 7 * CELL_SIZE + 6 * CELL_GAP;
  const { containerRef, scale, scaledWidth, scaledHeight } = useScaleToFit(
    naturalWidth,
    naturalHeight,
  );

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-foreground text-sm">
        <span className="font-semibold tabular-nums">
          {formatNumber(activity.totalContributions)}
        </span>{" "}
        contributions in the last year
      </p>

      <div ref={containerRef} className="w-full min-w-0 overflow-hidden">
        <div
          className="overflow-hidden"
          style={{ width: scaledWidth, height: scaledHeight }}
        >
          <div
            className="origin-top-left"
            style={{
              width: naturalWidth,
              transform: `scale(${scale})`,
            }}
          >
            <div className="flex">
              <div
                className="shrink-0"
                style={{ width: WEEKDAY_COLUMN_WIDTH }}
              />
              <div
                className="relative h-4 shrink-0 text-[10px] leading-none text-muted-foreground"
                style={{ width: gridWidth }}
              >
                {monthSegments.map(({ label, startWeek }) => (
                  <span
                    key={`${label}-${startWeek}`}
                    className="absolute top-0 whitespace-nowrap"
                    style={{ left: weekColumnOffset(startWeek, CELL_SIZE) }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div
              className="grid gap-[3px] text-[10px] leading-none text-muted-foreground"
              style={{
                gridTemplateColumns: `${WEEKDAY_COLUMN_WIDTH}px repeat(${columnCount}, ${CELL_SIZE}px)`,
              }}
            >
              {grid.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="contents">
                  <div className="flex items-center justify-end pr-1">
                    {WEEKDAY_LABELS.find((item) => item.row === rowIndex)
                      ?.label ?? ""}
                  </div>
                  {row.map((cell, columnIndex) => {
                    if (!cell) {
                      return (
                        <div
                          key={`empty-${rowIndex}-${columnIndex}`}
                          className="size-[11px] rounded-[2px] bg-transparent"
                        />
                      );
                    }

                    const level = getContributionLevel(cell.count);

                    return (
                      <div
                        key={cell.date}
                        className={`size-[11px] rounded-[2px] ${getContributionLevelClass(level)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="text-muted-foreground flex items-center justify-end gap-1 text-[10px]">
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <div
            key={level}
            className={`size-[11px] rounded-[2px] ${getContributionLevelClass(level)}`}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

export function ContributionGraph({
  activity,
  isPending,
  error,
}: ContributionGraphProps) {
  if (isPending) {
    return <ContributionGraphSkeleton />;
  }

  if (error || !activity) {
    return (
      <p className="text-muted-foreground text-sm">
        {error?.message ?? "Contribution activity unavailable."}
      </p>
    );
  }

  return <ContributionGraphContent activity={activity} />;
}
