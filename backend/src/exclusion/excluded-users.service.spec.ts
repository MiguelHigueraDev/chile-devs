import { ExcludedUsersService } from './excluded-users.service';

type MockState = {
  excluded: Map<string, { githubId: string; login: string }>;
  developers: Map<string, { githubId: string }>;
  rankingRefreshCount: number;
};

function createMockDb(state: MockState) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            const rows = [...state.excluded.values()];
            const first = rows.at(0);
            return Promise.resolve(first ? [{ githubId: first.githubId }] : []);
          },
        }),
      }),
    }),
    transaction: async (callback: (tx: unknown) => Promise<void>) => {
      await callback({
        insert: () => ({
          values: (row: { githubId: string; login: string }) => ({
            onConflictDoNothing: () => {
              if (!state.excluded.has(row.githubId)) {
                state.excluded.set(row.githubId, row);
              }
              return Promise.resolve();
            },
          }),
        }),
        delete: () => ({
          where: () => ({
            returning: () => {
              const githubId = [...state.developers.keys()][0];
              if (!githubId) {
                return Promise.resolve([]);
              }
              state.developers.delete(githubId);
              return Promise.resolve([{ githubId }]);
            },
          }),
        }),
        execute: () => {
          state.rankingRefreshCount += 1;
          return Promise.resolve();
        },
      });
    },
  };
}

function createService(state: MockState): ExcludedUsersService {
  return new ExcludedUsersService(createMockDb(state) as never);
}

describe('ExcludedUsersService', () => {
  it('excludes a user and deletes their developer profile', async () => {
    const state: MockState = {
      excluded: new Map(),
      developers: new Map([['123', { githubId: '123' }]]),
      rankingRefreshCount: 0,
    };
    const service = createService(state);

    const result = await service.excludeUser('123', 'octocat');

    expect(result).toEqual({ deletedProfile: true });
    expect(state.excluded.get('123')).toEqual({
      githubId: '123',
      login: 'octocat',
    });
    expect(state.developers.has('123')).toBe(false);
    expect(state.rankingRefreshCount).toBe(2);
  });

  it('is idempotent when opting out twice', async () => {
    const state: MockState = {
      excluded: new Map([['123', { githubId: '123', login: 'octocat' }]]),
      developers: new Map(),
      rankingRefreshCount: 0,
    };
    const service = createService(state);

    const result = await service.excludeUser('123', 'octocat');

    expect(result).toEqual({ deletedProfile: false });
    expect(state.excluded.size).toBe(1);
    expect(state.rankingRefreshCount).toBe(0);
  });

  it('reports excluded status after opt-out', async () => {
    const state: MockState = {
      excluded: new Map([['123', { githubId: '123', login: 'octocat' }]]),
      developers: new Map(),
      rankingRefreshCount: 0,
    };
    const service = createService(state);

    await expect(service.isExcluded('123')).resolves.toBe(true);
  });
});
