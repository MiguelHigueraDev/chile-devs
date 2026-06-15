import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const EXPLORED_DEVS_KEY = 'discovery:explored-devs';
const DEFAULT_TTL_HOURS = 24;

@Injectable()
export class DiscoveryExploredDevsStore implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor(
    private readonly config: ConfigService,
    redisClient?: Redis,
  ) {
    this.redis =
      redisClient ?? new Redis(this.config.getOrThrow<string>('REDIS_URL'));
    this.ttlSeconds = this.getTtlSeconds();
  }

  async count(): Promise<number> {
    return this.redis.scard(EXPLORED_DEVS_KEY);
  }

  async getAll(): Promise<Set<string>> {
    const members = await this.redis.smembers(EXPLORED_DEVS_KEY);
    return new Set(members);
  }

  async add(githubIds: string[]): Promise<void> {
    if (githubIds.length === 0) {
      return;
    }

    const pipeline = this.redis.pipeline();
    pipeline.sadd(EXPLORED_DEVS_KEY, ...githubIds);
    pipeline.expire(EXPLORED_DEVS_KEY, this.ttlSeconds);
    const results = await pipeline.exec();
    if (results) {
      for (const [error] of results) {
        if (error) {
          throw error;
        }
      }
    }
  }

  async reset(): Promise<void> {
    await this.redis.del(EXPLORED_DEVS_KEY);
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  private getTtlSeconds(): number {
    const ttlHours = Number(
      this.config.get<string>(
        'DISCOVERY_EXPLORED_DEVS_TTL_HOURS',
        String(DEFAULT_TTL_HOURS),
      ),
    );
    const hours =
      Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : DEFAULT_TTL_HOURS;
    return Math.floor(hours * 60 * 60);
  }
}
