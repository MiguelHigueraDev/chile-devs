import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: MultiPolygon };

type RegionFeature = {
  type: 'Feature';
  properties: { slug: string; name: string };
  geometry: GeoJsonGeometry;
};

type Bbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type ScatterCoordinate = {
  lat: number;
  lng: number;
};

export type ScatterRepoInput = {
  repoGithubId: string;
  regionSlug: string | null;
};

function loadRegionFeatures(): RegionFeature[] {
  const filePath = join(__dirname, 'chile-regions.geojson');
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as { features: RegionFeature[] };
  return parsed.features;
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeRingBbox(ring: Ring): Bbox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLng, minLat, maxLng, maxLat };
}

function mergeBboxes(a: Bbox, b: Bbox): Bbox {
  return {
    minLng: Math.min(a.minLng, b.minLng),
    minLat: Math.min(a.minLat, b.minLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

function computeGeometryBbox(geometry: GeoJsonGeometry): Bbox {
  const rings =
    geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.coordinates.flat();

  return rings.reduce(
    (bbox, ring) => mergeBboxes(bbox, computeRingBbox(ring)),
    {
      minLng: Infinity,
      minLat: Infinity,
      maxLng: -Infinity,
      maxLat: -Infinity,
    },
  );
}

function pointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-12) {
    return false;
  }

  const dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1);
  if (dot < 0) {
    return false;
  }

  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (squaredLength === 0) {
    return px === x1 && py === y1;
  }

  return dot <= squaredLength;
}

export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (pointOnSegment(lng, lat, xi, yi, xj, yj)) {
      return true;
    }

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygonCoordinates(
  lng: number,
  lat: number,
  polygon: Polygon,
): boolean {
  if (polygon.length === 0) {
    return false;
  }

  if (!pointInRing(lng, lat, polygon[0])) {
    return false;
  }

  for (let index = 1; index < polygon.length; index += 1) {
    if (pointInRing(lng, lat, polygon[index])) {
      return false;
    }
  }

  return true;
}

export function pointInGeometry(
  lng: number,
  lat: number,
  geometry: GeoJsonGeometry,
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonCoordinates(lng, lat, geometry.coordinates);
  }

  return geometry.coordinates.some((polygon) =>
    pointInPolygonCoordinates(lng, lat, polygon),
  );
}

function computeCentroid(geometry: GeoJsonGeometry): ScatterCoordinate {
  const points =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : (geometry.coordinates[0]?.[0] ?? []);

  if (points.length === 0) {
    return { lat: -35.6751, lng: -71.543 };
  }

  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of points) {
    sumLng += lng;
    sumLat += lat;
  }

  return {
    lng: sumLng / points.length,
    lat: sumLat / points.length,
  };
}

type RegionIndexEntry = {
  slug: string;
  name: string;
  geometry: GeoJsonGeometry;
  bbox: Bbox;
  centroid: ScatterCoordinate;
};

class RegionIndex {
  private readonly bySlug = new Map<string, RegionIndexEntry>();
  private readonly allRegions: RegionIndexEntry[] = [];
  readonly nationalBbox: Bbox;

  constructor(features: RegionFeature[]) {
    let nationalBbox: Bbox | null = null;

    for (const feature of features) {
      const entry: RegionIndexEntry = {
        slug: feature.properties.slug,
        name: feature.properties.name,
        geometry: feature.geometry,
        bbox: computeGeometryBbox(feature.geometry),
        centroid: computeCentroid(feature.geometry),
      };

      this.bySlug.set(entry.slug, entry);
      this.allRegions.push(entry);
      nationalBbox = nationalBbox
        ? mergeBboxes(nationalBbox, entry.bbox)
        : entry.bbox;
    }

    this.nationalBbox = nationalBbox ?? {
      minLng: -75,
      minLat: -56,
      maxLng: -66,
      maxLat: -17,
    };
  }

  getRegion(slug: string): RegionIndexEntry | null {
    return this.bySlug.get(slug) ?? null;
  }

  getAllRegions(): RegionIndexEntry[] {
    return this.allRegions;
  }
}

let regionIndex: RegionIndex | null = null;

function getRegionIndex(): RegionIndex {
  if (!regionIndex) {
    regionIndex = new RegionIndex(loadRegionFeatures());
  }
  return regionIndex;
}

/** Eager-load region polygons so promote/scatter does not block on first request. */
export function warmScatterRegionIndex(): void {
  getRegionIndex();
}

function sampleInBbox(
  random: () => number,
  bbox: Bbox,
): { lng: number; lat: number } {
  return {
    lng: bbox.minLng + random() * (bbox.maxLng - bbox.minLng),
    lat: bbox.minLat + random() * (bbox.maxLat - bbox.minLat),
  };
}

function sampleInGeometry(
  random: () => number,
  geometry: GeoJsonGeometry,
  bbox: Bbox,
  maxAttempts = 200,
): ScatterCoordinate | null {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const point = sampleInBbox(random, bbox);
    if (pointInGeometry(point.lng, point.lat, geometry)) {
      return { lng: point.lng, lat: point.lat };
    }
  }

  return null;
}

function sampleNational(
  random: () => number,
  index: RegionIndex,
): ScatterCoordinate {
  const regions = index.getAllRegions();
  const region = regions[Math.floor(random() * regions.length)];
  const sampled = sampleInGeometry(random, region.geometry, region.bbox);
  return sampled ?? region.centroid;
}

export function scatterRepoCoordinate(
  input: ScatterRepoInput,
): ScatterCoordinate {
  const index = getRegionIndex();
  const random = mulberry32(hashSeed(input.repoGithubId));

  if (input.regionSlug) {
    const region = index.getRegion(input.regionSlug);
    if (region) {
      const sampled = sampleInGeometry(random, region.geometry, region.bbox);
      if (sampled) {
        return sampled;
      }
      return region.centroid;
    }
  }

  return sampleNational(random, index);
}
