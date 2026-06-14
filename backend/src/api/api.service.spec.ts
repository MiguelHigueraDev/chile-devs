import {
  decodeCursor,
  decodeRepoCursor,
  encodeCursor,
  encodeRepoCursor,
} from './api.service';

describe('developer pagination cursors', () => {
  it('round-trips numeric rank cursors', () => {
    const cursor = encodeCursor('rank', 42.5, 'dev-123');
    expect(decodeCursor(cursor, 'rank')).toEqual({
      sort: 'rank',
      value: 42.5,
      githubId: 'dev-123',
    });
  });

  it('round-trips null rank cursors for unranked developers', () => {
    const cursor = encodeCursor('rank', null, 'dev-unranked');
    expect(decodeCursor(cursor, 'rank')).toEqual({
      sort: 'rank',
      value: null,
      githubId: 'dev-unranked',
    });
  });

  it('rejects null sort values for non-rank sorts', () => {
    const cursor = encodeCursor('rank', null, 'dev-unranked');
    expect(decodeCursor(cursor, 'contributions')).toBeNull();
  });

  it('rejects cursors when sort does not match', () => {
    const cursor = encodeCursor('rank', 10, 'dev-123');
    expect(decodeCursor(cursor, 'followers')).toBeNull();
  });
});

describe('repo pagination cursors', () => {
  it('round-trips stars cursors', () => {
    const cursor = encodeRepoCursor(1250, 'repo-456');
    expect(decodeRepoCursor(cursor)).toEqual({
      stars: 1250,
      repoGithubId: 'repo-456',
    });
  });

  it('rejects malformed repo cursors', () => {
    expect(decodeRepoCursor('not-a-cursor')).toBeNull();
  });
});
