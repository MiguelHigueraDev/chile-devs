import type { ExpressionSpecification } from 'maplibre-gl'

export const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export const DEV_COUNT_COLOR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'devCount'],
  1,
  '#dc2626',
  20,
  '#ea580c',
  75,
  '#ca8a04',
  200,
  '#65a30d',
  500,
  '#16a34a',
]

export const ZOOM_SCALED_RADIUS: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  ['min', ['+', 6, ['*', ['sqrt', ['get', 'devCount']], 1.2]], 18],
  7,
  ['min', ['+', 8, ['*', ['sqrt', ['get', 'devCount']], 1.8]], 22],
  10,
  ['min', ['+', 10, ['*', ['sqrt', ['get', 'devCount']], 2.5]], 26],
]

export const CLUSTER_RADIUS: ExpressionSpecification = [
  'step',
  ['get', 'devCount'],
  18,
  75,
  22,
  200,
  26,
  500,
  30,
  1000,
  34,
]

export const REPO_SCOPE_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'scope'],
  'regional',
  '#38bdf8',
  'national',
  '#f472b6',
  '#94a3b8',
]

export const REPO_STAR_RADIUS: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'stars'],
  0,
  6,
  50,
  8,
  200,
  10,
  1000,
  14,
  5000,
  18,
]

export const REPO_STAR_COLOR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'stars'],
  0,
  '#64748b',
  50,
  '#38bdf8',
  500,
  '#818cf8',
  2000,
  '#f472b6',
  10000,
  '#fbbf24',
]

export const REPO_CLUSTER_RADIUS: ExpressionSpecification = [
  'step',
  ['get', 'point_count'],
  18,
  5,
  22,
  15,
  26,
  30,
  30,
  50,
  34,
]
