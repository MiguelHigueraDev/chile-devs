import type { MapRepo } from '../types/api'

export type ViewportBbox = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
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
  return [...repos].filter((repo) => repoInViewport(repo, bbox))
}

export function mergeReposIntoMap(
  cache: Map<string, MapRepo>,
  repos: MapRepo[],
): void {
  for (const repo of repos) {
    cache.set(repo.repoGithubId, repo)
  }
}
