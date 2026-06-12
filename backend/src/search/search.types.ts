import { z } from 'zod';
import type { GeoZone } from './geo.data';

export const parsedQuerySchema = z
  .object({
    languages: z.array(z.string()),
    languageMode: z.enum(['any', 'all']),
    locationSlugs: z.array(z.string()),
    zone: z.enum(['north', 'central', 'south']).nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    sort: z.enum([
      'contributions',
      'followers',
      'stars',
      'rank',
      'languageShare',
    ]),
    shareLanguage: z.string().nullable(),
  })
  .refine(
    (data) =>
      data.sort !== 'languageShare' ||
      (typeof data.shareLanguage === 'string' &&
        data.shareLanguage.trim().length > 0),
    {
      error: 'shareLanguage is required when sort is languageShare',
      path: ['shareLanguage'],
    },
  );

export type ParsedQuery = z.infer<typeof parsedQuerySchema>;

export type SearchSortKey = ParsedQuery['sort'];

export type SearchInterpretation = ParsedQuery & {
  resolvedLocationSlugs: string[];
};

export const MAX_SEARCH_RESULTS = 50;
export const MAX_SEARCH_TEXT_LENGTH = 100;

export const ZONE_LABELS: Record<GeoZone, string> = {
  north: 'Northern Chile',
  central: 'Central Chile',
  south: 'Southern Chile',
};

export type SearchFacetsResponse = {
  languages: Array<{ name: string; count: number }>;
  locations: Array<{ slug: string; name: string; kind: 'region' | 'city' }>;
  zones: Array<{ id: GeoZone; label: string }>;
};

export function parseCsvParam(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeSearchInput(parsed: ParsedQuery): ParsedQuery {
  return {
    languages: parsed.languages.map((language) => language.toLowerCase()),
    languageMode: parsed.languageMode,
    locationSlugs: parsed.locationSlugs,
    zone: parsed.zone,
    username: normalizeUsername(parsed.username),
    displayName: normalizeDisplayName(parsed.displayName),
    sort: parsed.sort,
    shareLanguage: parsed.shareLanguage?.toLowerCase() ?? null,
  };
}

function normalizeUsername(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value
    .trim()
    .replace(/^@+/, '')
    .slice(0, MAX_SEARCH_TEXT_LENGTH);
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SEARCH_TEXT_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}
