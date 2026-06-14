export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export function getContributionLevel(count: number): ContributionLevel {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

const LEVEL_CLASSES: Record<ContributionLevel, string> = {
  0: "bg-[#ebedf0] dark:bg-[#161b22]",
  1: "bg-[#9be9a8] dark:bg-[#0e4429]",
  2: "bg-[#40c463] dark:bg-[#006d32]",
  3: "bg-[#30a14e] dark:bg-[#26a641]",
  4: "bg-[#216e39] dark:bg-[#39d353]",
};

export function getContributionLevelClass(level: ContributionLevel): string {
  return LEVEL_CLASSES[level];
}

export function formatContributionTooltip(count: number, date: string): string {
  const formatted = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (count === 0) {
    return `No contributions on ${formatted}`;
  }

  const label = count === 1 ? "contribution" : "contributions";
  return `${count} ${label} on ${formatted}`;
}

export function formatWeekTooltip(
  weekStart: string,
  total: number,
): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const range = `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  if (total === 0) {
    return `No commits ${range}`;
  }

  const label = total === 1 ? "commit" : "commits";
  return `${total} ${label} ${range}`;
}
