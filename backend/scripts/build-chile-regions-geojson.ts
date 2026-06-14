/**
 * Downloads geoBoundaries Chile ADM1 polygons, maps them to our location slugs,
 * simplifies geometry, and writes backend/src/search/chile-regions.geojson.
 *
 * Run: pnpm exec tsx scripts/build-chile-regions-geojson.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SOURCE_URL =
  'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/CHL/ADM1/geoBoundaries-CHL-ADM1_simplified.geojson';

const OUTPUT_PATH = join(__dirname, '../src/search/chile-regions.geojson');

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: MultiPolygon };

type GeoJsonFeature = {
  type: 'Feature';
  properties: { slug: string; name: string };
  geometry: GeoJsonGeometry;
};

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SHAPE_ID_TO_SLUG: Record<string, string> = {
  '47653553B40993810137393': 'antofagasta-region',
  '47653553B1207481020383': 'arica-y-parinacota',
  '47653553B71653813080592': 'atacama',
  '47653553B77266651052380': 'aysen',
  '47653553B91907313612474': 'coquimbo-region',
  '47653553B84299910343297': 'araucania',
  '47653553B69224850096491': 'los-lagos',
  '47653553B67595840047202': 'los-rios',
  '47653553B86325292267162': 'magallanes',
  '47653553B32293817275864': 'nuble',
  '47653553B97418467345315': 'tarapaca',
  '47653553B5611469222723': 'valparaiso-region',
  '47653553B66835736668351': 'biobio',
  '47653553B66141875659978': 'ohiggins',
  '47653553B65340542415201': 'maule',
  '47653553B78904739401519': 'metropolitana',
};

function resolveSlug(shapeName: string, shapeId?: string): string | null {
  if (shapeId && SHAPE_ID_TO_SLUG[shapeId]) {
    return SHAPE_ID_TO_SLUG[shapeId];
  }

  const normalized = normalizeName(shapeName);

  if (normalized.includes('arica')) return 'arica-y-parinacota';
  if (normalized.includes('tarapac')) return 'tarapaca';
  if (normalized.includes('antofagasta')) return 'antofagasta-region';
  if (normalized.includes('atacama')) return 'atacama';
  if (normalized.includes('coquimbo')) return 'coquimbo-region';
  if (normalized.includes('valparaiso')) return 'valparaiso-region';
  if (normalized.includes('metropolitana')) return 'metropolitana';
  if (normalized.includes('higgins') || normalized.includes('libertador')) {
    return 'ohiggins';
  }
  if (normalized.includes('maule')) return 'maule';
  if (normalized.includes('nuble') || normalized.includes('uble')) {
    return 'nuble';
  }
  if (normalized.includes('bio')) return 'biobio';
  if (normalized.includes('araucan')) return 'araucania';
  if (normalized.includes('los rios') || /los r/.test(normalized)) {
    return 'los-rios';
  }
  if (normalized.includes('los lagos') || /los l/.test(normalized)) {
    return 'los-lagos';
  }
  if (
    normalized.includes('aysen') ||
    normalized.includes('ays') ||
    normalized.includes('ibanez') ||
    normalized.includes('gral')
  ) {
    return 'aysen';
  }
  if (normalized.includes('magallanes')) return 'magallanes';

  return null;
}

function perpendicularDistance(
  point: Position,
  start: Position,
  end: Position,
): number {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    const px = x - x1;
    const py = y - y1;
    return Math.hypot(px, py);
  }

  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = x1 + clamped * dx;
  const projY = y1 + clamped * dy;
  return Math.hypot(x - projX, y - projY);
}

function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  let index = -1;
  let maxDistance = 0;

  for (let i = 1; i < ring.length - 1; i += 1) {
    const distance = perpendicularDistance(ring[i], first, last);
    if (distance > maxDistance) {
      index = i;
      maxDistance = distance;
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyRing(ring.slice(0, index + 1), tolerance);
    const right = simplifyRing(ring.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function simplifyGeometry(
  geometry: GeoJsonGeometry,
  tolerance: number,
): GeoJsonGeometry {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) =>
        simplifyRing(ring, tolerance),
      ),
    };
  }

  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => simplifyRing(ring, tolerance)),
    ),
  };
}

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download GeoJSON (${response.status})`);
  }

  const source = (await response.json()) as {
    features: Array<{
      properties: { shapeName: string; shapeID?: string };
      geometry: GeoJsonGeometry;
    }>;
  };

  const features: GeoJsonFeature[] = [];

  for (const feature of source.features) {
    const slug = resolveSlug(
      feature.properties.shapeName,
      feature.properties.shapeID,
    );
    if (!slug) {
      throw new Error(
        `Unable to map region "${feature.properties.shapeName}" to a slug`,
      );
    }

    features.push({
      type: 'Feature',
      properties: {
        slug,
        name: feature.properties.shapeName,
      },
      geometry: simplifyGeometry(feature.geometry, 0.02),
    });
  }

  features.sort((a, b) => a.properties.slug.localeCompare(b.properties.slug));

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`,
  );

  const bytes = readFileSync(OUTPUT_PATH).byteLength;
  console.log(
    `Wrote ${features.length} regions to ${OUTPUT_PATH} (${bytes} bytes)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
