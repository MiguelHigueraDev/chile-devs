export const SITE_NAME = "Chile Devs Map";

export const SITE_DESCRIPTION =
  "An interactive map of Chilean developers on GitHub. Browse by city and region, explore public contribution stats, and search by language or location.";

export const SITE_TAGLINE =
  "Discover Chilean developers on GitHub, mapped by city and region.";

export const SITE_LOCALE = "en_US";

export const TWITTER_CARD = "summary_large_image" as const;

export function getSiteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:5173";
}

export function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}
