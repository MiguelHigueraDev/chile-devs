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
  if (!hash.startsWith('#')) {
    return false;
  }

  const token = new URLSearchParams(hash.slice(1)).get('session');
  if (!token) {
    return false;
  }

  setAuthToken(token);

  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState({}, '', url);

  return true;
}
