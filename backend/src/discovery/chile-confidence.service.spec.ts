import { ConfigService } from '@nestjs/config';
import {
  ChileConfidenceService,
  type CandidateProfile,
} from './chile-confidence.service';

function createService(
  overrides: Record<string, string> = {},
): ChileConfidenceService {
  const config = {
    get: (key: string, fallback?: string) => overrides[key] ?? fallback,
  } as unknown as ConfigService;
  return new ChileConfidenceService(config);
}

function profile(partial: Partial<CandidateProfile>): CandidateProfile {
  return {
    login: 'someone',
    rawLocation: null,
    bio: null,
    company: null,
    blog: null,
    source: 'follower_graph',
    discoveredVia: null,
    ...partial,
  };
}

describe('ChileConfidenceService', () => {
  it('accepts a profile whose location explicitly mentions Chile', () => {
    const service = createService();
    const result = service.score(profile({ rawLocation: 'Santiago, Chile' }));

    expect(result.verdict).toBe('accepted');
    expect(result.reasons).toContain('location:chile');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('treats an ambiguous bare city as pending, not accepted', () => {
    const service = createService();
    const result = service.score(profile({ rawLocation: 'Santiago' }));

    expect(result.verdict).toBe('pending');
    expect(result.reasons).toContain('location:chilean-place');
  });

  it('accepts when an ambiguous city is reinforced by a .cl website', () => {
    const service = createService();
    const result = service.score(
      profile({ rawLocation: 'Santiago', blog: 'https://midominio.cl/cv' }),
    );

    expect(result.verdict).toBe('accepted');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['location:chilean-place', 'blog:.cl']),
    );
  });

  it('accepts on a Chilean company marker alone', () => {
    const service = createService();
    const result = service.score(profile({ company: '@Fintual' }));

    expect(result.verdict).toBe('accepted');
    expect(result.reasons).toContain('company:chilean-org');
  });

  it('detects a .cl host regardless of protocol or path', () => {
    const service = createService();
    expect(
      service.score(profile({ blog: 'www.empresa.cl' })).reasons,
    ).toContain('blog:.cl');
    expect(
      service.score(profile({ blog: 'http://empresa.cl/blog' })).reasons,
    ).toContain('blog:.cl');
    expect(
      service.score(profile({ blog: 'https://example.com' })).reasons,
    ).not.toContain('blog:.cl');
  });

  it('rejects a clearly non-Chilean profile', () => {
    const service = createService();
    const result = service.score(
      profile({
        rawLocation: 'Buenos Aires, Argentina',
        bio: 'Software engineer',
        company: 'Globant',
      }),
    );

    expect(result.verdict).toBe('rejected');
    expect(result.confidence).toBeLessThan(0.2);
  });

  it('rejects a single weak neighbor-overlap signal but escalates with more', () => {
    const service = createService();

    const single = service.score(profile({ neighborOverlap: 1 }));
    expect(single.verdict).toBe('rejected');

    const several = service.score(profile({ neighborOverlap: 2 }));
    expect(several.verdict).toBe('pending');
  });

  it('gives a small boost for being a contributor to a seeded CL org', () => {
    const service = createService();
    const result = service.score(
      profile({
        source: 'org_contributor',
        discoveredVia: 'Cornershop',
        neighborOverlap: 2,
      }),
    );

    expect(result.reasons).toContain('contributor:Cornershop');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('honors configurable thresholds', () => {
    const strict = createService({ DISCOVERY_ACCEPT_THRESHOLD: '0.95' });
    const result = strict.score(profile({ rawLocation: 'Santiago, Chile' }));
    expect(result.verdict).toBe('pending');
    expect(strict.thresholds.accept).toBe(0.95);
  });
});
