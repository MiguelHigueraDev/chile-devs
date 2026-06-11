import { useCallback, useState } from "react";

const STORAGE_KEY = "chile-devs:search-history";
const MAX_ENTRIES = 15;

function normalizeQuery(query: string): string {
  return query.trim();
}

function dedupeCaseInsensitive(entries: string[], query: string): string[] {
  const lower = query.toLowerCase();
  return entries.filter((entry) => entry.toLowerCase() !== lower);
}

export function getSearchHistory(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is string =>
        typeof entry === "string" && normalizeQuery(entry).length > 0,
    );
  } catch {
    return [];
  }
}

function persistSearchHistory(entries: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore write errors (e.g. private browsing)
  }
}

export function addSearchHistoryEntry(query: string): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return getSearchHistory();

  const next = [
    normalized,
    ...dedupeCaseInsensitive(getSearchHistory(), normalized),
  ].slice(0, MAX_ENTRIES);

  persistSearchHistory(next);
  return next;
}

export function removeSearchHistoryEntry(query: string): string[] {
  const lower = query.toLowerCase();
  const next = getSearchHistory().filter(
    (entry) => entry.toLowerCase() !== lower,
  );

  persistSearchHistory(next);
  return next;
}

export function clearSearchHistory(): string[] {
  persistSearchHistory([]);
  return [];
}

export function useSearchHistory() {
  const [entries, setEntries] = useState<string[]>(getSearchHistory);

  const add = useCallback((query: string) => {
    setEntries(addSearchHistoryEntry(query));
  }, []);

  const remove = useCallback((query: string) => {
    setEntries(removeSearchHistoryEntry(query));
  }, []);

  const clear = useCallback(() => {
    setEntries(clearSearchHistory());
  }, []);

  return { entries, add, remove, clear };
}
