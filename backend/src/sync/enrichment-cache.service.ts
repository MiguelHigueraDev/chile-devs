import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { GitHubEnrichment } from './github.service';

@Injectable()
export class EnrichmentCacheService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private readonly keyPrefix = 'enrichment:';

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(this.config.getOrThrow<string>('REDIS_URL'));
    this.ttlSeconds = this.getTtlSeconds();
  }

  async getMany(logins: string[]): Promise<Map<string, GitHubEnrichment>> {
    const result = new Map<string, GitHubEnrichment>();
    if (logins.length === 0) {
      return result;
    }

    const keys = logins.map((login) => this.key(login));
    const values = await this.redis.mget(...keys);

    logins.forEach((login, index) => {
      const raw = values[index];
      if (!raw) {
        return;
      }

      try {
        result.set(login, JSON.parse(raw) as GitHubEnrichment);
      } catch {
        // Ignore corrupted cache entries.
      }
    });

    return result;
  }

  async setMany(entries: Map<string, GitHubEnrichment>): Promise<void> {
    if (entries.size === 0) {
      return;
    }

    const pipeline = this.redis.pipeline();
    for (const [login, enrichment] of entries) {
      pipeline.setex(
        this.key(login),
        this.ttlSeconds,
        JSON.stringify(enrichment),
      );
    }
    await pipeline.exec();
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private key(login: string): string {
    return `${this.keyPrefix}${login.toLowerCase()}`;
  }

  private getTtlSeconds(): number {
    const ttlHours = Number(
      this.config.get<string>('SYNC_ENRICHMENT_TTL_HOURS', '24'),
    );
    const hours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24;
    return Math.floor(hours * 60 * 60);
  }
}
