const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

export function parseFrontendUrlConfig(raw?: string): {
  redirectUrl: string;
  corsOrigins: string[];
} {
  const corsOrigins = (raw ?? DEFAULT_FRONTEND_URL)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    corsOrigins.push(DEFAULT_FRONTEND_URL);
  }

  return {
    redirectUrl: corsOrigins[0],
    corsOrigins,
  };
}
