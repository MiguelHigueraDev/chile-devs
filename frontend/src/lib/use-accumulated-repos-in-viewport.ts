import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { reposInViewportQueryOptions } from '../api/queries'
import type { MapRepo } from '../types/api'
import {
  filterReposInViewport,
  mergeReposIntoMap,
  parseViewportBbox,
  type ViewportBbox,
  isViewportBboxCovered,
} from './viewport-bbox'

const accumulatedRepoCache = new Map<string, MapRepo>()
const accumulatedFetchedBboxes: ViewportBbox[] = []
const cacheResetListeners = new Set<() => void>()

export function resetAccumulatedReposCache(): void {
  accumulatedRepoCache.clear()
  accumulatedFetchedBboxes.length = 0
  for (const listener of cacheResetListeners) {
    listener()
  }
}

export function useAccumulatedReposInViewport(
  viewportBbox: string | null,
  enabled = true,
) {
  const queryClient = useQueryClient()
  const repoCacheRef = useRef(accumulatedRepoCache)
  const fetchedBboxesRef = useRef(accumulatedFetchedBboxes)
  const [cacheRevision, setCacheRevision] = useState(0)
  const [isFetching, setIsFetching] = useState(false)

  const parsedViewport = useMemo(
    () => (viewportBbox ? parseViewportBbox(viewportBbox) : null),
    [viewportBbox],
  )

  useEffect(() => {
    const handleCacheReset = () => {
      setCacheRevision((revision) => revision + 1)
    }

    cacheResetListeners.add(handleCacheReset)
    return () => {
      cacheResetListeners.delete(handleCacheReset)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !viewportBbox || !parsedViewport) {
      return
    }

    if (isViewportBboxCovered(parsedViewport, fetchedBboxesRef.current)) {
      return
    }

    let cancelled = false
    setIsFetching(true)

    void queryClient
      .fetchQuery(reposInViewportQueryOptions(viewportBbox))
      .then((repos) => {
        if (cancelled) return

        mergeReposIntoMap(repoCacheRef.current, repos)
        fetchedBboxesRef.current.push(parsedViewport)
        setCacheRevision((revision) => revision + 1)
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetching(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, viewportBbox, parsedViewport, queryClient, cacheRevision])

  const repos = useMemo(() => {
    void cacheRevision

    if (!parsedViewport) {
      return []
    }

    return filterReposInViewport(repoCacheRef.current.values(), parsedViewport)
  }, [parsedViewport, cacheRevision])

  return {
    data: repos,
    isFetching,
  }
}
