import { Clock, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchBarProps = {
  query?: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  recentSearches?: string[];
  onRemoveRecentSearch?: (query: string) => void;
  onClearRecentSearches?: () => void;
  className?: string;
};

export function SearchBar({
  query = "",
  onQueryChange,
  onSearch,
  recentSearches = [],
  onRemoveRecentSearch,
  onClearRecentSearches,
  className,
}: SearchBarProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredRecents = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return recentSearches;
    return recentSearches.filter((entry) =>
      entry.toLowerCase().includes(trimmed),
    );
  }, [query, recentSearches]);

  const showDropdown = open && filteredRecents.length > 0;

  const activeOptionIndex =
    showDropdown &&
    activeIndex >= 0 &&
    activeIndex < filteredRecents.length
      ? activeIndex
      : -1;

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const selectQuery = useCallback(
    (value: string) => {
      onQueryChange(value);
      onSearch(value);
      closeDropdown();
      inputRef.current?.blur();
    },
    [closeDropdown, onQueryChange, onSearch],
  );

  const submit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed);
    closeDropdown();
  }, [closeDropdown, onSearch, query]);

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

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (event.key === "ArrowDown" && filteredRecents.length > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) =>
          current < filteredRecents.length - 1 ? current + 1 : 0,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) =>
          current > 0 ? current - 1 : filteredRecents.length - 1,
        );
        break;
      case "Enter":
        if (activeOptionIndex >= 0) {
          event.preventDefault();
          selectQuery(filteredRecents[activeOptionIndex]!);
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
    <form
      className={cn("flex min-w-0 flex-1 items-center gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (activeOptionIndex >= 0) {
          selectQuery(filteredRecents[activeOptionIndex]!);
          return;
        }
        submit();
      }}
    >
      <div ref={containerRef} className="relative min-w-0 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          value={query}
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={
            activeOptionIndex >= 0
              ? `${listboxId}-option-${activeOptionIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-haspopup="listbox"
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder='Try "Top TypeScript developers in Biobío"'
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring h-8 w-full rounded-md border pr-3 pl-8 text-base focus-visible:ring-2 focus-visible:outline-none sm:text-sm"
          aria-label="Search developers"
        />

        {showDropdown && (
          <div
            className="border-border bg-popover text-popover-foreground absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 overflow-hidden rounded-md border shadow-md"
          >
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Recent searches"
              className="max-h-72 overflow-y-auto py-1"
            >
              {filteredRecents.map((entry, index) => (
                <li
                  key={entry}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeOptionIndex}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-1.5 text-sm",
                    index === activeOptionIndex &&
                      "bg-accent text-accent-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="hover:bg-accent/60 flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectQuery(entry)}
                  >
                    <Clock
                      className="text-muted-foreground size-3.5 shrink-0"
                      aria-hidden
                    />
                    <span className="truncate">{entry}</span>
                  </button>
                  {onRemoveRecentSearch && (
                    <button
                      type="button"
                      aria-label={`Remove "${entry}" from recent searches`}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent/60 shrink-0 rounded-sm p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onRemoveRecentSearch(entry)}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {onClearRecentSearches && filteredRecents.length > 0 && (
              <div className="border-border border-t px-2 py-1.5">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground w-full rounded-sm px-2 py-1 text-left text-xs transition-colors"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onClearRecentSearches();
                    closeDropdown();
                  }}
                >
                  Clear recent searches
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Button type="submit" size="sm" className="h-8 shrink-0 px-3 text-xs">
        Search
      </Button>
    </form>
  );
}
