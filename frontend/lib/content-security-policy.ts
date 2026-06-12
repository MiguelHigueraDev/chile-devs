export type ContentSecurityPolicyOptions = {
  backendUrl?: string;
  /** frame-ancestors only applies to HTTP headers, not <meta> tags. */
  includeFrameAncestors?: boolean;
};

const CARTO_BASEMAP_ORIGINS = [
  "https://basemaps.cartocdn.com",
  "https://*.basemaps.cartocdn.com",
] as const;

function extraConnectOrigins(backendUrl?: string): string[] {
  if (!backendUrl?.trim()) {
    return [];
  }

  try {
    const origin = new URL(backendUrl.trim()).origin;
    if (origin.startsWith("http://") || origin.startsWith("https://")) {
      return [origin];
    }
  } catch {
    // ignore invalid backend URL
  }

  return [];
}

export function buildContentSecurityPolicy(
  options: ContentSecurityPolicyOptions = {},
): string {
  const { includeFrameAncestors = true } = options;
  const cartoOrigins = CARTO_BASEMAP_ORIGINS.join(" ");
  const connectSrc = [
    "'self'",
    "https://api.github.com",
    ...CARTO_BASEMAP_ORIGINS,
    "https://vitals.vercel-insights.com",
    ...extraConnectOrigins(options.backendUrl),
  ];

  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://avatars.githubusercontent.com https://github.com ${cartoOrigins}`,
    `font-src 'self' data: ${cartoOrigins}`,
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src blob:",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ];

  if (includeFrameAncestors) {
    directives.push("frame-ancestors 'none'");
  }

  return directives.join("; ");
}
