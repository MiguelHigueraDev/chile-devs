import { useCallback, useState } from 'react';
import type { DeveloperSortKey } from '../types/api';

const STORAGE_KEY = 'chile-devs:developer-sort';

const VALID_SORTS = new Set<DeveloperSortKey>([
  'contributions',
  'followers',
  'stars',
]);

export function getDeveloperSortPreference(): DeveloperSortKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_SORTS.has(stored as DeveloperSortKey)) {
      return stored as DeveloperSortKey;
    }
  } catch {
    // ignore read errors (e.g. private browsing)
  }
  return 'contributions';
}

export function setDeveloperSortPreference(sort: DeveloperSortKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, sort);
  } catch {
    // ignore write errors
  }
}

export function useDeveloperSortPreference() {
  const [sortBy, setSortByState] = useState<DeveloperSortKey>(
    getDeveloperSortPreference,
  );

  const setSortBy = useCallback((sort: DeveloperSortKey) => {
    setDeveloperSortPreference(sort);
    setSortByState(sort);
  }, []);

  return [sortBy, setSortBy] as const;
}
