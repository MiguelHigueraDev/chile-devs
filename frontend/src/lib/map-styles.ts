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
