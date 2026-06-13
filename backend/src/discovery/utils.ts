import type { ConfigService } from '@nestjs/config';

/**
 * Reads a config value and coerces it into a positive integer, falling back to
 * the provided default when the value is missing, non-numeric, or <= 0.
 */
export function parsePositiveIntOrFallback(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = Number(config.get<string>(key, String(fallback)));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}
