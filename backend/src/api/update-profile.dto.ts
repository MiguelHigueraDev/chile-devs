import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const updateProfileSchema = z.object({
  portfolioUrl: z
    .union([z.string().url(), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' ? null : value))
    .refine(
      (value) =>
        value == null || value === undefined || value.startsWith('https://'),
      { message: 'Portfolio URL must use HTTPS' },
    ),
  description: z
    .union([z.string().max(500), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' ? null : value)),
  role: z
    .union([z.string().max(80), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' ? null : value)),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export function parseUpdateProfileInput(body: unknown): UpdateProfileInput {
  const result = updateProfileSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => issue.message)
      .join(', ');
    throw new BadRequestException(message);
  }
  return result.data;
}
