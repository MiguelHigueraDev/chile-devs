import Redis from 'ioredis';

const VIOLATION_WINDOW_SECONDS = 24 * 60 * 60;
const BAN_DURATION_SECONDS = 8 * 60 * 60;
const BAN_THRESHOLD = 2;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export type BanStatus = {
  banned: boolean;
  retryAfterSeconds?: number;
};

export type ViolationResult = {
  violations: number;
  banned: boolean;
};

export type ExceededWindowResult = {
  banned: boolean;
  violations?: number;
};

export class RateLimitBanService {
  private readonly redis: Redis;
  private readonly violationPrefix = 'ratelimit:violations:';
  private readonly banPrefix = 'ratelimit:ban:';
  private readonly exceededPrefix = 'ratelimit:exceeded:';

  constructor(redisUrl: string, redisClient?: Redis) {
    this.redis =
      redisClient ??
      new Redis(redisUrl, {
        connectTimeout: 500,
        maxRetriesPerRequest: 1,
      });
  }

  get client(): Redis {
    return this.redis;
  }

  async isBanned(key: string): Promise<BanStatus> {
    const banKey = this.banKey(key);
    const ttl = await this.redis.ttl(banKey);
    if (ttl <= 0) {
      return { banned: false };
    }

    return {
      banned: true,
      retryAfterSeconds: ttl,
    };
  }

  async recordViolation(key: string): Promise<ViolationResult> {
    const violationKey = this.violationKey(key);
    const violations = await this.redis.incr(violationKey);

    if (violations === 1) {
      await this.redis.expire(violationKey, VIOLATION_WINDOW_SECONDS);
    }

    if (violations < BAN_THRESHOLD) {
      return { violations, banned: false };
    }

    const banKey = this.banKey(key);
    await this.redis.set(banKey, '1', 'EX', BAN_DURATION_SECONDS, 'NX');

    return { violations, banned: true };
  }

  async recordExceededWindow(key: string): Promise<ExceededWindowResult> {
    const exceededKey = this.exceededKey(key);
    const isNewWindow = await this.redis.set(
      exceededKey,
      '1',
      'EX',
      RATE_LIMIT_WINDOW_SECONDS,
      'NX',
    );

    if (isNewWindow === null) {
      const banStatus = await this.isBanned(key);
      return { banned: banStatus.banned };
    }

    const { violations, banned } = await this.recordViolation(key);
    return { banned, violations };
  }

  disconnect(): void {
    this.redis.disconnect();
  }

  private violationKey(key: string): string {
    return `${this.violationPrefix}${key}`;
  }

  private banKey(key: string): string {
    return `${this.banPrefix}${key}`;
  }

  private exceededKey(key: string): string {
    return `${this.exceededPrefix}${key}`;
  }
}
