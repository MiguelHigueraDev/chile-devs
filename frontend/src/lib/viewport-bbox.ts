import type { MapRepo } from '../types/api'

export type ViewportBbox = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

/** Territorial extent used for map repo queries (includes mainland + islands). */
export const CHILE_VIEWPORT_BBOX: ViewportBbox = {
  minLng: -109.981,
  minLat: -61.097,
  maxLng: -26.58,
  maxLat: -14.287,
}

export function formatViewportBbox(bbox: ViewportBbox): string {
  return [
    bbox.minLng.toFixed(3),
    bbox.minLat.toFixed(3),
    bbox.maxLng.toFixed(3),
    bbox.maxLat.toFixed(3),
  ].join(',')
}

export function parseViewportBbox(bbox: string): ViewportBbox | null {
  const parts = bbox.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null
  }

  const [minLng, minLat, maxLng, maxLat] = parts
  if (minLng >= maxLng || minLat >= maxLat) {
    return null
  }

  return { minLng, minLat, maxLng, maxLat }
}

export function intersectBboxes(
  a: ViewportBbox,
  b: ViewportBbox,
): ViewportBbox | null {
  const minLng = Math.max(a.minLng, b.minLng)
  const minLat = Math.max(a.minLat, b.minLat)
  const maxLng = Math.min(a.maxLng, b.maxLng)
  const maxLat = Math.min(a.maxLat, b.maxLat)

  if (minLng >= maxLng || minLat >= maxLat) {
    return null
  }

  return { minLng, minLat, maxLng, maxLat }
}

export function clipViewportToChile(viewport: ViewportBbox): ViewportBbox | null {
  return intersectBboxes(viewport, CHILE_VIEWPORT_BBOX)
}

export function repoInChile(repo: MapRepo): boolean {
  return repoInViewport(repo, CHILE_VIEWPORT_BBOX)
}

export function isBboxContained(inner: ViewportBbox, outer: ViewportBbox): boolean {
  return (
    inner.minLng >= outer.minLng &&
    inner.minLat >= outer.minLat &&
    inner.maxLng <= outer.maxLng &&
    inner.maxLat <= outer.maxLat
  )
}

export function isViewportBboxCovered(
  viewport: ViewportBbox,
  fetchedBboxes: readonly ViewportBbox[],
): boolean {
  return fetchedBboxes.some((fetched) => isBboxContained(viewport, fetched))
}

export function repoInViewport(repo: MapRepo, bbox: ViewportBbox): boolean {
  return (
    repo.lng >= bbox.minLng &&
    repo.lng <= bbox.maxLng &&
    repo.lat >= bbox.minLat &&
    repo.lat <= bbox.maxLat
  )
}

export function filterReposInViewport(
  repos: Iterable<MapRepo>,
  bbox: ViewportBbox,
): MapRepo[] {
  return [...repos].filter(
    (repo) => repoInChile(repo) && repoInViewport(repo, bbox),
  )
}

export function mergeReposIntoMap(
  cache: Map<string, MapRepo>,
  repos: MapRepo[],
): void {
  for (const repo of repos) {
    cache.set(repo.repoGithubId, repo)
  }
}
