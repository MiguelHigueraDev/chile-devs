const STORAGE_KEY = 'chile_devs_session';

export function getAuthToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function consumeSessionFromUrlHash(): boolean {
  const hash = window.location.hash;
  const match = hash.match(/^#session=(.+)$/);
  if (!match?.[1]) {
    return false;
  }

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return false;
  }

  if (!token) {
    return false;
  }

  setAuthToken(token);

  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  );

  return true;
}
