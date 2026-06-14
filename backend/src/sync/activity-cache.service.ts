import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type {
  ContributionActivity,
  RepoCommitActivity,
} from './github.service';

@Injectable()
export class ActivityCacheService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private readonly userPrefix = 'activity:user:';
  private readonly repoPrefix = 'activity:repo:';

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(this.config.getOrThrow<string>('REDIS_URL'));
    this.ttlSeconds = this.getTtlSeconds();
  }

  async getUserActivity(login: string): Promise<ContributionActivity | null> {
    const raw = await this.redis.get(this.userKey(login));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as ContributionActivity;
    } catch {
      return null;
    }
  }

  async setUserActivity(
    login: string,
    activity: ContributionActivity,
  ): Promise<void> {
    await this.redis.setex(
      this.userKey(login),
      this.ttlSeconds,
      JSON.stringify(activity),
    );
  }

  async getRepoActivity(
    nameWithOwner: string,
  ): Promise<RepoCommitActivity | null> {
    const raw = await this.redis.get(this.repoKey(nameWithOwner));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as RepoCommitActivity;
    } catch {
      return null;
    }
  }

  async setRepoActivity(
    nameWithOwner: string,
    activity: RepoCommitActivity,
  ): Promise<void> {
    await this.redis.setex(
      this.repoKey(nameWithOwner),
      this.ttlSeconds,
      JSON.stringify(activity),
    );
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private userKey(login: string): string {
    return `${this.userPrefix}${login.toLowerCase()}`;
  }

  private repoKey(nameWithOwner: string): string {
    return `${this.repoPrefix}${nameWithOwner.toLowerCase()}`;
  }

  private getTtlSeconds(): number {
    const ttlHours = Number(
      this.config.get<string>('ACTIVITY_CACHE_TTL_HOURS', '10'),
    );
    const hours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 10;
    return Math.floor(hours * 60 * 60);
  }
}
