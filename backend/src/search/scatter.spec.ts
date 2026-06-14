import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  hashSeed,
  mulberry32,
  pointInGeometry,
  pointInRing,
  scatterRepoCoordinate,
} from './scatter';

describe('scatter', () => {
  it('hashSeed is deterministic', () => {
    expect(hashSeed('repo-123')).toBe(hashSeed('repo-123'));
    expect(hashSeed('repo-123')).not.toBe(hashSeed('repo-456'));
  });

  it('mulberry32 produces stable sequences', () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    expect(first()).toBe(second());
    expect(first()).toBe(second());
  });

  it('pointInRing detects inside/outside points', () => {
    const square: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];

    expect(pointInRing(1, 1, square)).toBe(true);
    expect(pointInRing(3, 3, square)).toBe(false);
  });

  it('scatterRepoCoordinate is deterministic for the same repo', () => {
    const first = scatterRepoCoordinate({
      repoGithubId: 'R_kgDOExample',
      regionSlug: 'metropolitana',
    });
    const second = scatterRepoCoordinate({
      repoGithubId: 'R_kgDOExample',
      regionSlug: 'metropolitana',
    });

    expect(first).toEqual(second);
  });

  it('scatterRepoCoordinate differs for national vs regional scope', () => {
    const regional = scatterRepoCoordinate({
      repoGithubId: 'R_kgDOExample',
      regionSlug: 'metropolitana',
    });
    const national = scatterRepoCoordinate({
      repoGithubId: 'R_kgDOExample',
      regionSlug: null,
    });

    expect(regional).not.toEqual(national);
  });

  it('scatterRepoCoordinate keeps national picks inside owner region when slug is provided', () => {
    const coordinate = scatterRepoCoordinate({
      repoGithubId: 'R_kgDONationalMetroPick',
      regionSlug: 'metropolitana',
    });

    expect(coordinate.lat).toBeGreaterThan(-34.5);
    expect(coordinate.lat).toBeLessThan(-32.5);
    expect(coordinate.lng).toBeGreaterThan(-72);
    expect(coordinate.lng).toBeLessThan(-69.5);
  });

  it('scatterRepoCoordinate never places metropolitana picks in magallanes', () => {
    const raw = readFileSync(join(__dirname, 'chile-regions.geojson'), 'utf8');
    const geojson = JSON.parse(raw) as {
      features: Array<{
        properties: { slug: string };
        geometry: Parameters<typeof pointInGeometry>[2];
      }>;
    };
    const magallanes = geojson.features.find(
      (feature) => feature.properties.slug === 'magallanes',
    )!;

    for (const repoGithubId of ['repo-a', 'repo-b', 'repo-c', 'repo-d']) {
      const coordinate = scatterRepoCoordinate({
        repoGithubId,
        regionSlug: 'metropolitana',
      });
      expect(
        pointInGeometry(coordinate.lng, coordinate.lat, magallanes.geometry),
      ).toBe(false);
    }
  });
});
