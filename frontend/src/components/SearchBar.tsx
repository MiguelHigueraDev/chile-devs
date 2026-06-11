import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchBarProps = {
  query?: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  className?: string;
};

export function SearchBar({
  query = "",
  onQueryChange,
  onSearch,
  className,
}: SearchBarProps) {
  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  };

  return (
    <form
      className={cn("flex min-w-0 flex-1 items-center gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder='Try "Top TypeScript developers in Biobío"'
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring h-8 w-full rounded-md border pr-3 pl-8 text-base focus-visible:ring-2 focus-visible:outline-none sm:text-sm"
          aria-label="Search developers"
        />
      </div>
      <Button type="submit" size="sm" className="h-8 shrink-0 px-3 text-xs">
        Search
      </Button>
    </form>
  );
}
