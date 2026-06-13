import { LOCATION_SEEDS } from '../db/locations.data';
import type { Location } from '../db/schema';
import { GithubService } from './github.service';

function createMockLocations(): Location[] {
  return LOCATION_SEEDS.map((seed, index) => ({
    id: index + 1,
    slug: seed.slug,
    name: seed.name,
    kind: seed.kind,
    lat: seed.lat,
    lng: seed.lng,
    searchTerms: seed.searchTerms,
  }));
}

function createGithubService(): GithubService {
  const config = {
    getOrThrow: () => 'test-token',
  };

  return new GithubService(config as never, {} as never);
}

describe('GithubService.classifyLocation', () => {
  const service = createGithubService();
  const locations = createMockLocations();

  const chile = () => locations.find((location) => location.slug === 'chile')!;
  const santiago = () =>
    locations.find((location) => location.slug === 'santiago')!;
  const losAngeles = () =>
    locations.find((location) => location.slug === 'los-angeles')!;
  const valparaiso = () =>
    locations.find((location) => location.slug === 'valparaiso')!;

  it('rejects foreign false positives', () => {
    expect(service.classifyLocation('Los Ángeles, CA', locations)).toBeNull();
    expect(
      service.classifyLocation('Santiago de Compostela', locations),
    ).toBeNull();
    expect(
      service.classifyLocation('Valparaíso, Brazil', locations),
    ).toBeNull();
    expect(service.classifyLocation('Madrid, Spain', locations)).toBeNull();
    expect(service.classifyLocation('China', locations)).toBeNull();
    expect(service.classifyLocation('San Francisco, CA', locations)).toBeNull();
    expect(service.classifyLocation('Valparaíso USA', locations)).toBeNull();
  });

  it('classifies Chilean city locations', () => {
    expect(service.classifyLocation('Santiago, Chile', locations)).toEqual(
      santiago(),
    );
    expect(service.classifyLocation('Los Ángeles, Chile', locations)).toEqual(
      losAngeles(),
    );
    expect(service.classifyLocation('Los Ángeles', locations)).toEqual(
      losAngeles(),
    );
    expect(service.classifyLocation('Santiago', locations)).toEqual(santiago());
    expect(service.classifyLocation('Valparaíso', locations)).toEqual(
      valparaiso(),
    );
  });

  it('classifies country-level locations as Chile', () => {
    expect(service.classifyLocation('Chile', locations)).toEqual(chile());
    expect(service.classifyLocation('🇨🇱', locations)).toEqual(chile());
    expect(service.classifyLocation('Chile 🇨🇱', locations)).toEqual(chile());
  });

  it('rejects missing or blank locations', () => {
    expect(service.classifyLocation(null, locations)).toBeNull();
    expect(service.classifyLocation('', locations)).toBeNull();
    expect(service.classifyLocation('   ', locations)).toBeNull();
  });
});
