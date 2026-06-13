import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOCATION_SEEDS } from '../db/locations.data';
import type { DiscoverySource } from '../db/schema';
import { CHILEAN_COMPANY_MARKERS } from './seeds.data';

export type CandidateProfile = {
  login: string;
  rawLocation: string | null;
  bio: string | null;
  company: string | null;
  blog: string | null;
  source: DiscoverySource;
  discoveredVia: string | null;
  // How many already-verified Chilean devs point at this candidate in the graph.
  neighborOverlap?: number;
};

export type ConfidenceResult = {
  // 0..1 probability-like score that the candidate is a Chilean developer.
  confidence: number;
  // Human-readable signal keys that contributed to the score.
  reasons: string[];
  // Final verdict given the configured thresholds.
  verdict: 'accepted' | 'rejected' | 'pending';
};

const DEFAULT_ACCEPT_THRESHOLD = 0.6;
const DEFAULT_REJECT_THRESHOLD = 0.2;

// Individual signal weights (0..1). Combined with a noisy-OR so multiple weak
// signals reinforce each other while no single weak signal can force acceptance.
const WEIGHTS = {
  locationCountry: 0.7,
  locationPlace: 0.4,
  blogCl: 0.55,
  companyMarker: 0.6,
  bioMention: 0.35,
  contributorSeed: 0.25,
} as const;

// Each verified neighbor adds this much, capped, so a dense Chilean follower
// cluster is meaningful but never decisive on its own.
const NEIGHBOR_WEIGHT_STEP = 0.15;
const NEIGHBOR_WEIGHT_CAP = 0.5;

/**
 * Scores how likely a discovered GitHub user is a Chilean developer, combining
 * several weak/strong heuristic signals. Pure and dependency-light so it can be
 * unit-tested with fixture profiles.
 */
@Injectable()
export class ChileConfidenceService {
  private readonly acceptThreshold: number;
  private readonly rejectThreshold: number;
  private readonly placeTerms: string[];
  private readonly companyMarkers: string[];

  constructor(private readonly config: ConfigService) {
    this.acceptThreshold = this.readThreshold(
      'DISCOVERY_ACCEPT_THRESHOLD',
      DEFAULT_ACCEPT_THRESHOLD,
    );
    this.rejectThreshold = this.readThreshold(
      'DISCOVERY_REJECT_THRESHOLD',
      DEFAULT_REJECT_THRESHOLD,
    );
    this.placeTerms = this.buildPlaceTerms();
    this.companyMarkers = CHILEAN_COMPANY_MARKERS.map((m) => this.normalize(m));
  }

  score(profile: CandidateProfile): ConfidenceResult {
    const reasons: string[] = [];
    const weights: number[] = [];

    const location = this.normalize(profile.rawLocation ?? '');
    if (location) {
      if (this.mentionsChile(location)) {
        weights.push(WEIGHTS.locationCountry);
        reasons.push('location:chile');
      } else if (this.matchesPlaceTerm(location)) {
        weights.push(WEIGHTS.locationPlace);
        reasons.push('location:chilean-place');
      }
    }

    if (this.blogIsDotCl(profile.blog)) {
      weights.push(WEIGHTS.blogCl);
      reasons.push('blog:.cl');
    }

    if (this.companyMatches(profile.company)) {
      weights.push(WEIGHTS.companyMarker);
      reasons.push('company:chilean-org');
    }

    const bio = this.normalize(profile.bio ?? '');
    if (bio && (this.mentionsChile(bio) || this.matchesPlaceTerm(bio))) {
      weights.push(WEIGHTS.bioMention);
      reasons.push('bio:chile-mention');
    }

    if (
      profile.source === 'org_contributor' ||
      profile.source === 'repo_contributor'
    ) {
      weights.push(WEIGHTS.contributorSeed);
      reasons.push(`contributor:${profile.discoveredVia ?? 'seed'}`);
    }

    const overlap = profile.neighborOverlap ?? 0;
    if (overlap > 0) {
      const overlapWeight = Math.min(
        overlap * NEIGHBOR_WEIGHT_STEP,
        NEIGHBOR_WEIGHT_CAP,
      );
      weights.push(overlapWeight);
      reasons.push(`neighbor-overlap:${overlap}`);
    }

    const confidence = this.combine(weights);
    return {
      confidence,
      reasons,
      verdict: this.verdict(confidence),
    };
  }

  get thresholds(): { accept: number; reject: number } {
    return { accept: this.acceptThreshold, reject: this.rejectThreshold };
  }

  private verdict(confidence: number): ConfidenceResult['verdict'] {
    if (confidence >= this.acceptThreshold) {
      return 'accepted';
    }
    if (confidence < this.rejectThreshold) {
      return 'rejected';
    }
    return 'pending';
  }

  // Noisy-OR combination: confidence = 1 - Π(1 - w_i).
  private combine(weights: number[]): number {
    const product = weights.reduce(
      (acc, weight) => acc * (1 - Math.min(Math.max(weight, 0), 1)),
      1,
    );
    return Number((1 - product).toFixed(4));
  }

  private mentionsChile(normalized: string): boolean {
    return (
      normalized.includes('chile') ||
      normalized.includes('chilean') ||
      normalized.includes('chileno') ||
      normalized.includes('chilena') ||
      normalized.includes('🇨🇱')
    );
  }

  private matchesPlaceTerm(normalized: string): boolean {
    return this.placeTerms.some((term) => normalized.includes(term));
  }

  private companyMatches(company: string | null): boolean {
    if (!company) {
      return false;
    }
    const normalized = this.normalize(company);
    if (!normalized) {
      return false;
    }
    return this.companyMarkers.some((marker) => normalized.includes(marker));
  }

  private blogIsDotCl(blog: string | null): boolean {
    if (!blog) {
      return false;
    }
    const trimmed = blog.trim().toLowerCase();
    if (!trimmed) {
      return false;
    }

    const withoutProtocol = trimmed.replace(/^[a-z]+:\/\//, '');
    const host = withoutProtocol.split(/[/?#]/)[0].replace(/\.+$/, '');
    return host.endsWith('.cl');
  }

  // City/region names + their search terms, normalized, excluding the country
  // entry and any short/ambiguous tokens (len < 4 like "cl", "rm").
  private buildPlaceTerms(): string[] {
    const terms = new Set<string>();
    for (const seed of LOCATION_SEEDS) {
      if (seed.kind === 'country') {
        continue;
      }
      for (const raw of [seed.name, ...seed.searchTerms]) {
        const normalized = this.normalize(raw);
        if (normalized.length >= 4) {
          terms.add(normalized);
        }
      }
    }
    return [...terms];
  }

  private readThreshold(key: string, fallback: number): number {
    const raw = Number(this.config.get<string>(key, String(fallback)));
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : fallback;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
