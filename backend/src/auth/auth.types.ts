export type SessionPayload = {
  githubId: string;
  login: string;
  avatarUrl: string;
};

export type AuthenticatedRequest = {
  session: SessionPayload;
};
