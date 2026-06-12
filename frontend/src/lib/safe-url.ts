export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function toSafeHttpsUrl(url: string | null | undefined): string | null {
  if (!isSafeHttpsUrl(url)) {
    return null;
  }

  return url!.trim();
}
