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
export const MAX_SEARCH_QUERY_LENGTH = 500;

export const ZONE_LABELS: Record<GeoZone, string> = {
  north: 'Northern Chile',
  central: 'Central Chile',
  south: 'Southern Chile',
};
