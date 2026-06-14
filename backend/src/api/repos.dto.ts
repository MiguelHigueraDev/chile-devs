import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const bboxSchema = z.object({
  bbox: z
    .string()
    .trim()
    .min(1, 'bbox is required')
    .transform((value, ctx) => {
      const parts = value.split(',').map((part) => Number(part.trim()));
      if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
        ctx.addIssue({
          code: 'custom',
          message:
            'bbox must be four comma-separated numbers: minLng,minLat,maxLng,maxLat',
        });
        return z.NEVER;
      }

      const [minLng, minLat, maxLng, maxLat] = parts;
      if (minLng >= maxLng || minLat >= maxLat) {
        ctx.addIssue({
          code: 'custom',
          message: 'bbox min values must be less than max values',
        });
        return z.NEVER;
      }

      return { minLng, minLat, maxLng, maxLat };
    }),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type ReposViewportInput = {
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  limit: number;
};

const DEFAULT_REPOS_LIMIT = 300;

export function parseReposViewportQuery(query: {
  bbox?: string;
  limit?: string;
}): ReposViewportInput {
  const parsed = bboxSchema.safeParse(query);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => issue.message)
      .join(', ');
    throw new BadRequestException(message);
  }

  return {
    bbox: parsed.data.bbox,
    limit: parsed.data.limit ?? DEFAULT_REPOS_LIMIT,
  };
}

const reposListSchema = z.object({
  region: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
  cursor: z.string().trim().min(1).optional(),
});

export type ReposListInput = {
  regionSlug?: string;
  limit: number;
  cursor?: string;
};

const DEFAULT_REPOS_LIST_LIMIT = 10;

export function parseReposListQuery(query: {
  region?: string;
  limit?: string;
  cursor?: string;
}): ReposListInput {
  const parsed = reposListSchema.safeParse(query);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => issue.message)
      .join(', ');
    throw new BadRequestException(message);
  }

  return {
    regionSlug: parsed.data.region,
    limit: parsed.data.limit ?? DEFAULT_REPOS_LIST_LIMIT,
    cursor: parsed.data.cursor,
  };
}
