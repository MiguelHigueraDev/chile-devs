import { Search, SlidersHorizontal, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useSearchFacets } from "../api/queries";
import { useStackedSheetDismissGuard } from "../lib/stacked-sheet-dismiss";
import { RANK_SORT_LABEL } from "../lib/rank";
import {
  DEFAULT_DEVELOPER_SORT,
  DEFAULT_SEARCH_PARAMS,
  type SearchParams,
  type SearchSortKey,
} from "../types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SearchFilterSheetProps = {
  open: boolean;
  params: SearchParams;
  onChange: (params: SearchParams) => void;
  resultsOpen: boolean;
  devPanelOpen?: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (params: SearchParams) => void;
};

const BASE_SORT_OPTIONS: Array<{ value: SearchSortKey; label: string }> = [
  { value: "rank", label: RANK_SORT_LABEL },
  { value: "stars", label: "Stars" },
  { value: "followers", label: "Followers" },
  { value: "contributions", label: "Contributions" },
  { value: "languageShare", label: "Language share" },
];

function FilterSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function SelectableChip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background hover:bg-accent/60 text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

const SUGGESTION_LIMIT = 8;

type LocationFacet = {
  slug: string;
  name: string;
  kind: "region" | "city";
};

type LocationTypeaheadProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (slug: string) => void;
  selectedSlugs: string[];
  locations: LocationFacet[];
  loading?: boolean;
  placeholder?: string;
  inputId?: string;
  listboxLabel?: string;
  emptyMessage?: string;
};

function LocationTypeahead({
  query,
  onQueryChange,
  onSelect,
  selectedSlugs,
  locations,
  loading = false,
  placeholder = "Type to add a region or city...",
  inputId,
  listboxLabel = "Location suggestions",
  emptyMessage = "No matching regions or cities found.",
}: LocationTypeaheadProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    return locations
      .filter(
        (location) =>
          !selectedSlugs.includes(location.slug) &&
          (location.name.toLowerCase().includes(trimmed) ||
            location.slug.toLowerCase().includes(trimmed)),
      )
      .slice(0, SUGGESTION_LIMIT);
  }, [locations, query, selectedSlugs]);

  const showDropdown = open && query.trim().length > 0 && !loading;

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const pickLocation = useCallback(
    (slug: string) => {
      onSelect(slug);
      onQueryChange("");
      closeDropdown();
    },
    [closeDropdown, onQueryChange, onSelect],
  );

  useEffect(() => {
    if (!showDropdown) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeDropdown, showDropdown]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) {
      if (event.key === "Escape") {
        closeDropdown();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) =>
          current < suggestions.length - 1 ? current + 1 : 0,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) =>
          current > 0 ? current - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        if (activeIndex >= 0) {
          event.preventDefault();
          pickLocation(suggestions[activeIndex]!.slug);
        }
        break;
      case "Escape":
        event.preventDefault();
        closeDropdown();
        break;
      case "Tab":
        closeDropdown();
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <Input
        id={inputId}
        value={query}
        role="combobox"
        aria-expanded={showDropdown && suggestions.length > 0}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-haspopup="listbox"
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-8 pl-8 text-sm"
        autoComplete="off"
      />

      {showDropdown && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={listboxLabel}
          className="border-border bg-popover text-popover-foreground absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 max-h-48 overflow-y-auto rounded-md border py-1 shadow-md"
        >
          {suggestions.map((location, index) => (
            <li
              key={location.slug}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                  index === activeIndex && "bg-accent text-accent-foreground",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickLocation(location.slug)}
              >
                <span>{location.name}</span>
                <span className="text-muted-foreground text-xs capitalize">
                  {location.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showDropdown && suggestions.length === 0 && (
        <p className="border-border bg-popover text-muted-foreground absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 rounded-md border px-3 py-2 text-xs shadow-md">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

function SelectedLocationBadges({
  slugs,
  catalog,
  onRemove,
}: {
  slugs: string[];
  catalog: LocationFacet[];
  onRemove: (slug: string) => void;
}) {
  if (slugs.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No regions or cities selected yet.
      </p>
    );
  }

  const nameBySlug = new Map(
    catalog.map((location) => [location.slug, location]),
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {slugs.map((slug) => {
        const location = nameBySlug.get(slug);
        const label = location?.name ?? slug.replace(/-/g, " ");

        return (
          <Badge key={slug} variant="secondary" className="gap-1 pr-1">
            {label}
            {location && (
              <span className="text-muted-foreground capitalize">
                · {location.kind}
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              className="hover:bg-background/60 rounded-sm p-0.5"
              onClick={() => onRemove(slug)}
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}

const LANGUAGE_SUGGESTION_LIMIT = SUGGESTION_LIMIT;

type LanguageTypeaheadProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (language: string) => void;
  selected: string[];
  languages: Array<{ name: string; count: number }>;
  loading?: boolean;
  placeholder?: string;
  inputId?: string;
  listboxLabel?: string;
};

function LanguageTypeahead({
  query,
  onQueryChange,
  onSelect,
  selected,
  languages,
  loading = false,
  placeholder = "Type to add a language...",
  inputId,
  listboxLabel = "Language suggestions",
}: LanguageTypeaheadProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    return languages
      .filter(
        (language) =>
          !selected.includes(language.name) &&
          language.name.toLowerCase().includes(trimmed),
      )
      .slice(0, LANGUAGE_SUGGESTION_LIMIT);
  }, [languages, query, selected]);

  const showDropdown = open && query.trim().length > 0 && !loading;

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const pickLanguage = useCallback(
    (language: string) => {
      onSelect(language);
      onQueryChange("");
      closeDropdown();
    },
    [closeDropdown, onQueryChange, onSelect],
  );

  useEffect(() => {
    if (!showDropdown) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeDropdown, showDropdown]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) {
      if (event.key === "Escape") {
        closeDropdown();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) =>
          current < suggestions.length - 1 ? current + 1 : 0,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) =>
          current > 0 ? current - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        if (activeIndex >= 0) {
          event.preventDefault();
          pickLanguage(suggestions[activeIndex]!.name);
        }
        break;
      case "Escape":
        event.preventDefault();
        closeDropdown();
        break;
      case "Tab":
        closeDropdown();
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <Input
        id={inputId}
        value={query}
        role="combobox"
        aria-expanded={showDropdown && suggestions.length > 0}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-haspopup="listbox"
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-8 pl-8 text-sm"
        autoComplete="off"
      />

      {showDropdown && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={listboxLabel}
          className="border-border bg-popover text-popover-foreground absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 max-h-48 overflow-y-auto rounded-md border py-1 shadow-md"
        >
          {suggestions.map((language, index) => (
            <li
              key={language.name}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                  index === activeIndex && "bg-accent text-accent-foreground",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickLanguage(language.name)}
              >
                <span className="capitalize">{language.name}</span>
                <span className="text-muted-foreground tabular-nums text-xs">
                  {language.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showDropdown && suggestions.length === 0 && (
        <p className="border-border bg-popover text-muted-foreground absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 rounded-md border px-3 py-2 text-xs shadow-md">
          No matching languages found.
        </p>
      )}
    </div>
  );
}

function SelectedLanguageBadges({
  languages,
  onRemove,
}: {
  languages: string[];
  onRemove: (language: string) => void;
}) {
  if (languages.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No languages selected yet.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {languages.map((language) => (
        <Badge
          key={language}
          variant="secondary"
          className="gap-1 pr-1 capitalize"
        >
          {language}
          <button
            type="button"
            aria-label={`Remove ${language}`}
            className="hover:bg-background/60 rounded-sm p-0.5"
            onClick={() => onRemove(language)}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

export function SearchFilterSheet({
  open,
  params: draft,
  onChange,
  resultsOpen,
  devPanelOpen = false,
  onOpenChange,
  onApply,
}: SearchFilterSheetProps) {
  const { data: facets, isPending: facetsPending } = useSearchFacets();
  const [languageQuery, setLanguageQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);
  const childOpen = resultsOpen || devPanelOpen;
  const { handleOpenChange, blockOutsideDismiss } =
    useStackedSheetDismissGuard(childOpen);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLanguageQuery("");
      setLocationQuery("");
    }
  }

  const facetLanguages = facets?.languages ?? [];
  const facetLocations = facets?.locations ?? [];

  const sortOptions = useMemo(
    () =>
      draft.languages.length > 0
        ? BASE_SORT_OPTIONS
        : BASE_SORT_OPTIONS.filter(
            (option) => option.value !== "languageShare",
          ),
    [draft.languages.length],
  );

  const addLanguage = (language: string) => {
    if (draft.languages.includes(language)) {
      return;
    }

    const languages = [...draft.languages, language];
    let shareLanguage = draft.shareLanguage;
    if (draft.sort === "languageShare" && !shareLanguage) {
      shareLanguage = language;
    }

    onChange({ ...draft, languages, shareLanguage });
  };

  const removeLanguage = (language: string) => {
    const languages = draft.languages.filter((entry) => entry !== language);

    let shareLanguage = draft.shareLanguage;
    if (draft.sort === "languageShare") {
      if (
        shareLanguage === language ||
        !languages.includes(shareLanguage ?? "")
      ) {
        shareLanguage = languages[0] ?? null;
      }
    }

    const sort =
      languages.length === 0 && draft.sort === "languageShare"
        ? DEFAULT_DEVELOPER_SORT
        : draft.sort;

    onChange({
      ...draft,
      languages,
      shareLanguage: languages.length === 0 ? null : shareLanguage,
      sort,
    });
  };

  const addLocation = (slug: string) => {
    if (draft.locationSlugs.includes(slug)) {
      return;
    }

    onChange({
      ...draft,
      locationSlugs: [...draft.locationSlugs, slug],
    });
  };

  const removeLocation = (slug: string) => {
    onChange({
      ...draft,
      locationSlugs: draft.locationSlugs.filter((entry) => entry !== slug),
    });
  };

  const setZone = (zone: SearchParams["zone"]) => {
    onChange({
      ...draft,
      zone: draft.zone === zone ? null : zone,
    });
  };

  const canApply =
    draft.sort !== "languageShare" ||
    Boolean(
      draft.shareLanguage && draft.languages.includes(draft.shareLanguage),
    );

  const handleApply = () => {
    const shareLanguage =
      draft.sort === "languageShare"
        ? (draft.shareLanguage ?? draft.languages[0] ?? null)
        : null;

    if (
      draft.sort === "languageShare" &&
      (!shareLanguage || !draft.languages.includes(shareLanguage))
    ) {
      return;
    }

    onApply({
      ...draft,
      shareLanguage,
    });
  };

  const handleClear = () => {
    onChange(DEFAULT_SEARCH_PARAMS);
    setLanguageQuery("");
    setLocationQuery("");
  };

  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={(nextOpen) =>
        handleOpenChange(nextOpen, () => onOpenChange(false))
      }
    >
      <SheetContent
        side="right"
        inert={childOpen ? true : undefined}
        onPointerDownOutside={blockOutsideDismiss}
        onInteractOutside={blockOutsideDismiss}
        onFocusOutside={blockOutsideDismiss}
        className="border-border/60 bg-background/98 flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b pb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="text-muted-foreground size-4" />
            <SheetTitle className="text-lg">Search filters</SheetTitle>
          </div>
          <SheetDescription>
            Choose languages, locations, and how results are ranked.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-4 py-4">
            <FilterSection
              title="Languages"
              description="Filter developers by the languages they use most."
            >
              <div
                className="flex gap-1"
                role="group"
                aria-label="Language match mode"
              >
                <Button
                  type="button"
                  size="xs"
                  variant={
                    draft.languageMode === "any" ? "secondary" : "outline"
                  }
                  aria-pressed={draft.languageMode === "any"}
                  onClick={() => onChange({ ...draft, languageMode: "any" })}
                >
                  Any
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={
                    draft.languageMode === "all" ? "secondary" : "outline"
                  }
                  aria-pressed={draft.languageMode === "all"}
                  onClick={() => onChange({ ...draft, languageMode: "all" })}
                >
                  All
                </Button>
              </div>

              <LanguageTypeahead
                query={languageQuery}
                onQueryChange={setLanguageQuery}
                onSelect={addLanguage}
                selected={draft.languages}
                languages={facetLanguages}
                loading={facetsPending}
                inputId="search-language-typeahead"
                listboxLabel="Add language filter"
              />

              <SelectedLanguageBadges
                languages={draft.languages}
                onRemove={removeLanguage}
              />
            </FilterSection>

            <Separator />

            <FilterSection
              title="Location"
              description="Narrow results by zone, region, or city."
            >
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Geographic zone"
              >
                {(facets?.zones ?? []).map((zone) => (
                  <SelectableChip
                    key={zone.id}
                    selected={draft.zone === zone.id}
                    onClick={() => setZone(zone.id)}
                  >
                    {zone.label}
                  </SelectableChip>
                ))}
              </div>

              <LocationTypeahead
                query={locationQuery}
                onQueryChange={setLocationQuery}
                onSelect={addLocation}
                selectedSlugs={draft.locationSlugs}
                locations={facetLocations}
                loading={facetsPending}
                inputId="search-location-typeahead"
                listboxLabel="Add region or city filter"
              />

              <SelectedLocationBadges
                slugs={draft.locationSlugs}
                catalog={facetLocations}
                onRemove={removeLocation}
              />
            </FilterSection>

            <Separator />

            <FilterSection
              title="Developer"
              description="Look up a specific GitHub user or display name."
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="search-username">GitHub username</Label>
                  <Input
                    id="search-username"
                    value={draft.username ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        username: event.target.value.replace(/^@+/, "") || null,
                      })
                    }
                    placeholder="octocat"
                    className="h-8 text-sm"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-display-name">Display name</Label>
                  <Input
                    id="search-display-name"
                    value={draft.displayName ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        displayName: event.target.value || null,
                      })
                    }
                    placeholder="Juan Perez"
                    className="h-8 text-sm"
                    autoComplete="off"
                  />
                </div>
              </div>
            </FilterSection>

            <Separator />

            <FilterSection
              title="Sort results by"
              description="Choose how matching developers are ranked."
            >
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="Sort results by"
              >
                {sortOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="xs"
                    variant={
                      draft.sort === option.value ? "secondary" : "outline"
                    }
                    aria-pressed={draft.sort === option.value}
                    onClick={() =>
                      onChange({
                        ...draft,
                        sort: option.value,
                        shareLanguage:
                          option.value === "languageShare"
                            ? draft.shareLanguage &&
                              draft.languages.includes(draft.shareLanguage)
                              ? draft.shareLanguage
                              : (draft.languages[0] ?? null)
                            : null,
                      })
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              {draft.sort === "languageShare" && draft.languages.length > 0 && (
                <div className="space-y-2">
                  <Label>Language for share ranking</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.languages.map((language) => (
                      <SelectableChip
                        key={language}
                        selected={draft.shareLanguage === language}
                        onClick={() =>
                          onChange({ ...draft, shareLanguage: language })
                        }
                      >
                        <span className="capitalize">{language}</span>
                      </SelectableChip>
                    ))}
                  </div>
                </div>
              )}
            </FilterSection>
          </div>
        </ScrollArea>

        <SheetFooter className="border-border shrink-0 border-t px-4 py-3 sm:flex-row">
          <Button type="button" variant="outline" onClick={handleClear}>
            Clear all
          </Button>
          <Button type="button" onClick={handleApply} disabled={!canApply}>
            Show results
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
