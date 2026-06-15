import { GithubService } from './github.service';
import type { EnrichmentCacheService } from './enrichment-cache.service';

function createService(): GithubService {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('test-token'),
  };
  const enrichmentCache = {} as EnrichmentCacheService;

  return new GithubService(config as never, enrichmentCache);
}

describe('GithubService activity fetchers', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetchContributionActivity maps calendar weeks and days', async () => {
    const service = createService();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => ({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: 42,
                weeks: [
                  {
                    contributionDays: [
                      { date: '2025-06-01', contributionCount: 0 },
                      { date: '2025-06-02', contributionCount: 5 },
                    ],
                  },
                  {
                    contributionDays: [
                      { date: '2025-06-08', contributionCount: 12 },
                    ],
                  },
                ],
              },
            },
          },
          rateLimit: { remaining: 4000, resetAt: '2026-01-01T00:00:00Z' },
        },
      }),
    });

    const activity = await service.fetchContributionActivity('octocat');

    expect(activity).toEqual({
      totalContributions: 42,
      weeks: [
        [
          { date: '2025-06-01', count: 0 },
          { date: '2025-06-02', count: 5 },
        ],
        [{ date: '2025-06-08', count: 12 }],
      ],
    });
  });

  it('fetchContributionActivity returns null when calendar is missing', async () => {
    const service = createService();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => ({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: null,
            },
          },
        },
      }),
    });

    await expect(
      service.fetchContributionActivity('ghost'),
    ).resolves.toBeNull();
  });

  it('fetchRepoCommitActivity filters empty weeks and maps totals', async () => {
    const service = createService();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'x-ratelimit-remaining'
            ? '4000'
            : name === 'x-ratelimit-reset'
              ? String(Math.floor(Date.now() / 1000) + 3600)
              : null,
      },
      json: () => [
        { week: 0, total: 0, days: [0, 0, 0, 0, 0, 0, 0] },
        {
          week: 1_704_067_200,
          total: 9,
          days: [1, 2, 1, 2, 1, 1, 1],
        },
      ],
    });

    const activity = await service.fetchRepoCommitActivity(
      'octocat/Hello-World',
    );

    expect(activity.weeks).toHaveLength(1);
    expect(activity.weeks[0]).toEqual({
      weekStart: '2024-01-01',
      total: 9,
      days: [1, 2, 1, 2, 1, 1, 1],
    });
  });

  it('fetchRepoCommitActivity retries when GitHub returns 202', async () => {
    const service = createService();
    jest
      .spyOn(service as unknown as { sleep: () => Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);

    const pendingResponse = {
      ok: false,
      status: 202,
      headers: { get: () => null },
      text: () => '',
    };
    const readyResponse = {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'x-ratelimit-remaining'
            ? '4000'
            : name === 'x-ratelimit-reset'
              ? String(Math.floor(Date.now() / 1000) + 3600)
              : null,
      },
      json: () => [
        {
          week: 1_704_067_200,
          total: 3,
          days: [0, 1, 1, 1, 0, 0, 0],
        },
      ],
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(pendingResponse)
      .mockResolvedValueOnce(readyResponse);

    const activity = await service.fetchRepoCommitActivity(
      'octocat/Hello-World',
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(activity.weeks[0]?.total).toBe(3);
  });
});
