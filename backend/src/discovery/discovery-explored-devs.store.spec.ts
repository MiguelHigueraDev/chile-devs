import Redis from 'ioredis';
import { DiscoveryExploredDevsStore } from './discovery-explored-devs.store';

type RedisMockState = {
  sets: Map<string, Set<string>>;
  ttls: Map<string, number>;
};

function createRedisMock(): {
  client: Redis;
  state: RedisMockState;
} {
  const state: RedisMockState = {
    sets: new Map(),
    ttls: new Map(),
  };

  const client = {
    scard: (key: string) => Promise.resolve(state.sets.get(key)?.size ?? 0),
    smembers: (key: string) =>
      Promise.resolve([...(state.sets.get(key) ?? [])]),
    sadd: (key: string, ...members: string[]) => {
      const set = state.sets.get(key) ?? new Set<string>();
      for (const member of members) {
        set.add(member);
      }
      state.sets.set(key, set);
      return Promise.resolve(members.length);
    },
    expire: (key: string, seconds: number) => {
      state.ttls.set(key, seconds);
      return Promise.resolve(1);
    },
    del: (key: string) => {
      state.sets.delete(key);
      state.ttls.delete(key);
      return Promise.resolve(1);
    },
    pipeline: () => {
      const commands: Array<() => Promise<unknown>> = [];
      const pipeline = {
        sadd: (key: string, ...members: string[]) => {
          commands.push(() => client.sadd(key, ...members));
          return pipeline;
        },
        expire: (key: string, seconds: number) => {
          commands.push(() => client.expire(key, seconds));
          return pipeline;
        },
        exec: async () => {
          const results: [null, unknown][] = [];
          for (const command of commands) {
            results.push([null, await command()]);
          }
          return results;
        },
      };
      return pipeline;
    },
    disconnect: () => undefined,
  } as unknown as Redis;

  return { client, state };
}

function createStore(client: Redis): DiscoveryExploredDevsStore {
  const config = {
    getOrThrow: () => 'redis://localhost:6379',
    get: (_key: string, fallback?: string) => fallback,
  };
  return new DiscoveryExploredDevsStore(config as never, client);
}

describe('DiscoveryExploredDevsStore', () => {
  let mock: ReturnType<typeof createRedisMock>;
  let store: DiscoveryExploredDevsStore;

  beforeEach(() => {
    mock = createRedisMock();
    store = createStore(mock.client);
  });

  it('returns zero when no explored devs exist', async () => {
    await expect(store.count()).resolves.toBe(0);
    await expect(store.getAll()).resolves.toEqual(new Set());
  });

  it('adds explored devs and refreshes ttl', async () => {
    await store.add(['dev-1', 'dev-2']);

    await expect(store.count()).resolves.toBe(2);
    await expect(store.getAll()).resolves.toEqual(new Set(['dev-1', 'dev-2']));
    expect(mock.state.ttls.get('discovery:explored-devs')).toBe(24 * 60 * 60);
  });

  it('resets explored devs', async () => {
    await store.add(['dev-1']);
    await store.reset();

    await expect(store.count()).resolves.toBe(0);
    expect(mock.state.sets.has('discovery:explored-devs')).toBe(false);
  });
});
