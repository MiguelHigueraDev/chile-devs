export function toGithubDatabaseId(value: string | number): string {
  return String(value);
}

export function isGithubDatabaseId(value: string): boolean {
  return /^\d+$/.test(value);
}

export function parseGithubDatabaseIdFromNodeId(nodeId: string): string | null {
  if (isGithubDatabaseId(nodeId)) {
    return nodeId;
  }

  try {
    const decoded = Buffer.from(nodeId, 'base64').toString('utf8');
    const match = decoded.match(/User(\d+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
