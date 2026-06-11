import type { ExpressionSpecification } from 'maplibre-gl'

export const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export const DEV_COUNT_COLOR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'devCount'],
  1,
  '#3b82f6',
  20,
  '#6366f1',
  50,
  '#8b5cf6',
  100,
  '#a855f7',
  200,
  '#d946ef',
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
  50,
  22,
  100,
  26,
  200,
  30,
  500,
  34,
]
