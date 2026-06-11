import { ExternalLink } from "lucide-react";
import { formatNumber } from "../lib/utils";
import type { DeveloperSortKey, DeveloperSummary } from "../types/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TopLanguagesBar } from "./TopLanguagesBar";
import { cn } from "@/lib/utils";

export type DeveloperMetricKey = DeveloperSortKey | "languageShare";

type DeveloperListProps = {
  developers: DeveloperSummary[];
  sortBy: DeveloperMetricKey;
  shareLanguage?: string | null;
  showSummary?: boolean;
  onDeveloperSelect?: (login: string) => void;
};

const SORT_LABELS: Record<DeveloperMetricKey, string> = {
  contributions: "contributions",
  followers: "followers",
  stars: "stars",
  languageShare: "language share",
};

const PODIUM_ROW_STYLES: Record<1 | 2 | 3, string> = {
  1: "bg-amber-400/18",
  2: "bg-neutral-300/12",
  3: "bg-orange-600/18",
};

function getDeveloperMetric(
  dev: DeveloperSummary,
  sortBy: DeveloperMetricKey,
  shareLanguage?: string | null,
): number {
  if (sortBy === "followers") {
    return dev.followers;
  }
  if (sortBy === "stars") {
    return dev.totalStars;
  }
  if (sortBy === "languageShare" && shareLanguage) {
    const match = dev.topLanguages.find(
      (language) => language.name.toLowerCase() === shareLanguage.toLowerCase(),
    );
    return match?.share ?? 0;
  }
  return dev.contributions;
}

function formatMetricValue(value: number, sortBy: DeveloperMetricKey): string {
  if (sortBy === "languageShare") {
    return `${value}%`;
  }
  return formatNumber(value);
}

export function DeveloperList({
  developers,
  sortBy,
  shareLanguage,
  showSummary = true,
  onDeveloperSelect,
}: DeveloperListProps) {
  const sortLabel =
    sortBy === "languageShare" && shareLanguage
      ? `${shareLanguage} share`
      : SORT_LABELS[sortBy];

  return (
    <ul>
      {developers.map((dev, index) => {
        const rank = index + 1;
        const podiumStyle =
          rank <= 3 ? PODIUM_ROW_STYLES[rank as 1 | 2 | 3] : undefined;
        const metric = getDeveloperMetric(dev, sortBy, shareLanguage);

        return (
          <li
            key={dev.login}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              podiumStyle,
              rank > 3 && "border-border border-t",
              onDeveloperSelect &&
                "hover:bg-accent/40 cursor-pointer transition-colors",
            )}
            onClick={
              onDeveloperSelect
                ? () => onDeveloperSelect(dev.login)
                : undefined
            }
            onKeyDown={
              onDeveloperSelect
                ? (event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest(
                        'a,button,input,textarea,select,[role="link"],[role="button"]',
                      )
                    ) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onDeveloperSelect(dev.login);
                    }
                  }
                : undefined
            }
            role={onDeveloperSelect ? "button" : undefined}
            tabIndex={onDeveloperSelect ? 0 : undefined}
          >
            <span
              className={cn(
                "w-7 shrink-0 text-center text-sm tabular-nums",
                rank <= 3
                  ? "text-foreground font-bold"
                  : "text-muted-foreground font-medium",
              )}
              aria-label={`Rank ${rank}`}
            >
              {rank}
            </span>
            <Avatar className="size-8">
              <AvatarImage src={dev.avatarUrl} alt={dev.login} />
              <AvatarFallback>
                {dev.login.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1">
                <span className="text-foreground text-sm font-medium">
                  {dev.login}
                </span>
                <a
                  href={dev.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${dev.login} on GitHub`}
                  className="text-muted-foreground hover:text-foreground inline-flex transition-colors"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>
              {dev.name && (
                <p className="text-muted-foreground truncate text-xs">
                  {dev.name}
                </p>
              )}
              {dev.topLanguages.length > 0 && (
                <TopLanguagesBar
                  languages={dev.topLanguages}
                  className="mt-1.5"
                />
              )}
            </div>
            <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
              {formatMetricValue(metric, sortBy)}
            </span>
          </li>
        );
      })}
      {showSummary && (
        <p className="text-muted-foreground px-4 pt-2 text-xs">
          {developers.length === 0
            ? "No developers matched this search."
            : `Showing ${formatNumber(developers.length)} developers by ${sortLabel}`}
        </p>
      )}
    </ul>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { getDeveloperMetric, SORT_LABELS };
