import { z } from 'zod';
import type { GeoZone } from './geo.data';

export const parsedQuerySchema = z.object({
  languages: z.array(z.string()),
  languageMode: z.enum(['any', 'all']),
  locationSlugs: z.array(z.string()),
  zone: z.enum(['north', 'central', 'south']).nullable(),
  sort: z.enum(['contributions', 'followers', 'stars', 'languageShare']),
  shareLanguage: z.string().nullable(),
});

export type ParsedQuery = z.infer<typeof parsedQuerySchema>;

export type SearchSortKey = ParsedQuery['sort'];

export type SearchInterpretation = ParsedQuery & {
  resolvedLocationSlugs: string[];
};

export const MAX_SEARCH_RESULTS = 50;
export const MAX_SEARCH_QUERY_LENGTH = 500;

export const ZONE_LABELS: Record<GeoZone, string> = {
  north: 'Northern Chile',
  central: 'Central Chile',
  south: 'Southern Chile',
};
