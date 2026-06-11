import type { MapLocation, StatsResponse } from '../types/api'

export const ALL_CHILE_SLUG = '__all__'

export function isAllChileLocation(location: MapLocation): boolean {
  return location.slug === ALL_CHILE_SLUG
}

export function createAllChileLocation(stats: StatsResponse): MapLocation {
  return {
    slug: ALL_CHILE_SLUG,
    name: 'Chile',
    kind: 'country',
    lat: -35.675,
    lng: -71.543,
    devCount: stats.totalDevs,
    totalContributions: stats.totalContributions,
  }
}
