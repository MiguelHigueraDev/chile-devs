import Redis from 'ioredis';
import { RateLimitBanService } from './rate-limit-ban.service';

type RedisMockState = {
  strings: Map<string, string>;
  ttls: Map<string, number>;
  counters: Map<string, number>;
};

function createRedisMock(): {
  client: Redis;
  state: RedisMockState;
} {
  const state: RedisMockState = {
    strings: new Map(),
    ttls: new Map(),
    counters: new Map(),
  };

  const client = {
    ttl: (key: string) => {
      if (!state.strings.has(key)) {
        return Promise.resolve(-2);
      }
      return Promise.resolve(state.ttls.get(key) ?? -1);
    },
    eval: (
      _script: string,
      _numKeys: number,
      key: string,
      ttlSeconds: number,
    ) => {
      const next = (state.counters.get(key) ?? 0) + 1;
      state.counters.set(key, next);
      if (next === 1) {
        state.ttls.set(key, ttlSeconds);
      }
      return Promise.resolve(next);
    },
    set: (
      key: string,
      value: string,
      _mode: 'EX',
      seconds: number,
      nx: 'NX',
    ) => {
      if (nx === 'NX' && state.strings.has(key)) {
        return Promise.resolve(null);
      }
      state.strings.set(key, value);
      state.ttls.set(key, seconds);
      return Promise.resolve('OK');
    },
    disconnect: () => undefined,
  } as unknown as Redis;

  return { client, state };
}

describe('RateLimitBanService', () => {
  let service: RateLimitBanService;
  let mock: ReturnType<typeof createRedisMock>;

  beforeEach(() => {
    mock = createRedisMock();
    service = new RateLimitBanService('redis://localhost:6379', mock.client);
  });

  it('returns not banned when no ban key exists', async () => {
    await expect(service.isBanned('1.2.3.4')).resolves.toEqual({
      banned: false,
    });
  });

  it('returns banned with retry-after from ttl', async () => {
    mock.state.strings.set('ratelimit:ban:1.2.3.4', '1');
    mock.state.ttls.set('ratelimit:ban:1.2.3.4', 3600);

    await expect(service.isBanned('1.2.3.4')).resolves.toEqual({
      banned: true,
      retryAfterSeconds: 3600,
    });
  });

  it('records first violation without banning', async () => {
    await expect(service.recordViolation('1.2.3.4')).resolves.toEqual({
      violations: 1,
      banned: false,
    });
    expect(mock.state.counters.get('ratelimit:violations:1.2.3.4')).toBe(1);
    expect(mock.state.ttls.get('ratelimit:violations:1.2.3.4')).toBe(
      24 * 60 * 60,
    );
    expect(mock.state.strings.has('ratelimit:ban:1.2.3.4')).toBe(false);
  });

  it('bans on second violation within the window', async () => {
    await service.recordViolation('1.2.3.4');

    await expect(service.recordViolation('1.2.3.4')).resolves.toEqual({
      violations: 2,
      banned: true,
    });
    expect(mock.state.strings.get('ratelimit:ban:1.2.3.4')).toBe('1');
    expect(mock.state.ttls.get('ratelimit:ban:1.2.3.4')).toBe(8 * 60 * 60);
  });

  it('does not extend ban ttl on subsequent violations', async () => {
    mock.state.strings.set('ratelimit:ban:1.2.3.4', '1');
    mock.state.ttls.set('ratelimit:ban:1.2.3.4', 100);
    mock.state.counters.set('ratelimit:violations:1.2.3.4', 2);

    await service.recordViolation('1.2.3.4');

    expect(mock.state.ttls.get('ratelimit:ban:1.2.3.4')).toBe(100);
  });

  it('counts only one violation per exceeded window', async () => {
    await service.recordExceededWindow('1.2.3.4');
    await service.recordExceededWindow('1.2.3.4');

    expect(mock.state.counters.get('ratelimit:violations:1.2.3.4')).toBe(1);
  });

  it('bans on second exceeded window within 24 hours', async () => {
    await service.recordExceededWindow('1.2.3.4');
    mock.state.strings.delete('ratelimit:exceeded:1.2.3.4');

    await expect(service.recordExceededWindow('1.2.3.4')).resolves.toEqual({
      banned: true,
      violations: 2,
    });
  });
});
