export type ContentSecurityPolicyOptions = {
  backendUrl?: string;
};

function extraConnectOrigins(backendUrl?: string): string[] {
  if (!backendUrl?.trim()) {
    return [];
  }

  try {
    const origin = new URL(backendUrl.trim()).origin;
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
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
  const connectSrc = [
    "'self'",
    'https://api.github.com',
    'https://*.basemaps.cartocdn.com',
    'https://vitals.vercel-insights.com',
    'https:',
    ...extraConnectOrigins(options.backendUrl),
  ];

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://github.com https://*.basemaps.cartocdn.com",
    "font-src 'self' data: https://*.basemaps.cartocdn.com",
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src blob:",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
