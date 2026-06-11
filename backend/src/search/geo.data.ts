import { LOCATION_SEEDS } from '../db/locations.data';

export type GeoZone = 'north' | 'central' | 'south';

export const REGION_TO_CITIES: Record<string, string[]> = {
  'arica-y-parinacota': ['arica'],
  tarapaca: ['iquique'],
  'antofagasta-region': ['antofagasta', 'calama'],
  atacama: ['copiapo'],
  'coquimbo-region': ['la-serena', 'coquimbo'],
  'valparaiso-region': ['valparaiso', 'vina-del-mar'],
  metropolitana: ['santiago'],
  ohiggins: ['rancagua'],
  maule: ['talca'],
  nuble: ['chillan'],
  biobio: ['concepcion', 'los-angeles'],
  araucania: ['temuco'],
  'los-rios': ['valdivia'],
  'los-lagos': ['puerto-montt', 'osorno'],
  aysen: ['coyhaique'],
  magallanes: ['punta-arenas'],
};

export const ZONES: Record<GeoZone, string[]> = {
  north: [
    'arica-y-parinacota',
    'tarapaca',
    'antofagasta-region',
    'atacama',
    'coquimbo-region',
  ],
  central: [
    'valparaiso-region',
    'metropolitana',
    'ohiggins',
    'maule',
    'nuble',
    'biobio',
  ],
  south: ['araucania', 'los-rios', 'los-lagos', 'aysen', 'magallanes'],
};

export const LOCATION_SLUGS = LOCATION_SEEDS.map((location) => location.slug);

export const LOCATION_CATALOG = LOCATION_SEEDS.map((location) => ({
  slug: location.slug,
  name: location.name,
  kind: location.kind,
}));

export function expandLocationSlugs(slugs: string[]): Set<string> {
  const expanded = new Set<string>();

  for (const slug of slugs) {
    expanded.add(slug);

    const cities = REGION_TO_CITIES[slug];
    if (cities) {
      for (const city of cities) {
        expanded.add(city);
      }
    }
  }

  return expanded;
}

export function resolveLocationSlugs(
  locationSlugs: string[],
  zone: GeoZone | null,
): Set<string> {
  const resolved = expandLocationSlugs(locationSlugs);

  if (zone) {
    for (const regionSlug of ZONES[zone]) {
      resolved.add(regionSlug);
      for (const city of REGION_TO_CITIES[regionSlug] ?? []) {
        resolved.add(city);
      }
    }
  }

  return resolved;
}
