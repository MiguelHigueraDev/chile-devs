import { useSearch } from "../api/queries";
import type { DeveloperSortKey, SearchInterpretation } from "../types/api";
import { DeveloperList } from "./DeveloperList";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type SearchResultsPanelProps = {
  query: string | null;
  sortBy: DeveloperSortKey;
  onClose: () => void;
  onDeveloperSelect?: (login: string) => void;
  devPanelOpen?: boolean;
};

function formatInterpretationChips(
  interpretation: SearchInterpretation,
): string[] {
  const chips: string[] = [];

  if (interpretation.languages.length > 0) {
    const joined = interpretation.languages
      .map((language) => language.charAt(0).toUpperCase() + language.slice(1))
      .join(interpretation.languageMode === "all" ? " + " : " / ");
    chips.push(joined);
  }

  if (interpretation.zone) {
    const zoneLabels = {
      north: "Northern Chile",
      central: "Central Chile",
      south: "Southern Chile",
    } as const;
    chips.push(zoneLabels[interpretation.zone]);
  }

  if (interpretation.locationSlugs.length > 0) {
    chips.push(
      ...interpretation.locationSlugs.map((slug) => slug.replace(/-/g, " ")),
    );
  }

  if (interpretation.username) {
    chips.push(`@${interpretation.username}`);
  }

  if (interpretation.displayName) {
    chips.push(interpretation.displayName);
  }

  const sortLabels = {
    contributions: "by contributions",
    followers: "by followers",
    stars: "by stars",
    languageShare: interpretation.shareLanguage
      ? `by ${interpretation.shareLanguage} share`
      : "by language share",
  } as const;
  chips.push(sortLabels[interpretation.sort]);

  if (chips.length === 0) {
    chips.push("All Chile", "by contributions");
  }

  return chips;
}

export function SearchResultsPanel({
  query,
  sortBy,
  onClose,
  onDeveloperSelect,
  devPanelOpen = false,
}: SearchResultsPanelProps) {
  const { data, error, isPending } = useSearch(query, sortBy);

  return (
    <Sheet
      open={!!query}
      modal={false}
      onOpenChange={(open) => {
        if (!open && !devPanelOpen) onClose();
      }}
    >
      <SheetContent
        side="right"
        inert={devPanelOpen ? true : undefined}
        className="border-border/60 bg-background/98 flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {query && (
          <>
            <SheetHeader className="shrink-0 border-b pb-4">
              <SheetTitle className="text-lg">Search results</SheetTitle>
              <SheetDescription className="line-clamp-2">
                {query}
              </SheetDescription>
              {data?.interpretation && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {formatInterpretationChips(data.interpretation).map(
                    (chip) => (
                      <Badge key={chip} variant="secondary">
                        {chip}
                      </Badge>
                    ),
                  )}
                </div>
              )}
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              {isPending && (
                <div className="space-y-3 px-4 py-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-7" />
                      <Skeleton className="size-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-2.5 w-32" />
                      </div>
                      <Skeleton className="h-3 w-10" />
                    </div>
                  ))}
                </div>
              )}

              {error && !isPending && (
                <div className="space-y-2 px-4 py-4 text-sm">
                  <p className="text-destructive">{error.message}</p>
                  <p className="text-muted-foreground">
                    This may be because the current search quota has been
                    exceeded. Please try again tomorrow.
                  </p>
                </div>
              )}

              {data && !isPending && (
                <DeveloperList
                  developers={data.developers}
                  sortBy={data.interpretation.sort}
                  shareLanguage={data.interpretation.shareLanguage}
                  onDeveloperSelect={onDeveloperSelect}
                />
              )}
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
