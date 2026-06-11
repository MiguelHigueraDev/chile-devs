import type { CookieSerializeOptions } from '@fastify/cookie';
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { developers } from '../db/schema';
import { parseFrontendUrlConfig } from '../lib/frontend-url';
import type { SessionPayload } from './auth.types';

const SESSION_COOKIE = 'chile_devs_session';
const OAUTH_STATE_COOKIE = 'chile_devs_oauth_state';
const GITHUB_FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = GITHUB_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id: number;
  login: string;
  avatar_url: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  get sessionCookieName(): string {
    return SESSION_COOKIE;
  }

  get oauthStateCookieName(): string {
    return OAUTH_STATE_COOKIE;
  }

  getSessionCookieOptions(): CookieSerializeOptions {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      path: '/',
    };
  }

  createOAuthState(): string {
    return randomBytes(16).toString('hex');
  }

  getGitHubAuthorizeUrl(state: string): string {
    const clientId = this.configService.get<string>('GITHUB_OAUTH_CLIENT_ID');
    const callbackUrl = this.getCallbackUrl();

    if (!clientId) {
      throw new BadRequestException('GitHub OAuth is not configured');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  getCallbackUrl(): string {
    const port = this.configService.get<string>('PORT') ?? '3000';
    const explicit =
      this.configService.get<string>('GITHUB_OAUTH_CALLBACK_URL') ??
      `http://localhost:${port}/api/auth/github/callback`;
    return explicit;
  }

  getFrontendUrl(): string {
    return parseFrontendUrlConfig(
      this.configService.get<string>('FRONTEND_URL'),
    ).redirectUrl;
  }

  async exchangeCodeForSession(
    code: string,
    state: string,
    storedState: string | undefined,
  ): Promise<{ token: string; redirectUrl: string }> {
    if (!storedState || storedState !== state) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const clientId = this.configService.get<string>('GITHUB_OAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'GITHUB_OAUTH_CLIENT_SECRET',
    );

    if (!clientId || !clientSecret) {
      throw new BadRequestException('GitHub OAuth is not configured');
    }

    let githubUser: GitHubUserResponse;
    try {
      const tokenResponse = await fetchWithTimeout(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: this.getCallbackUrl(),
          }),
        },
      );

      if (!tokenResponse.ok) {
        throw new UnauthorizedException('Failed to exchange OAuth code');
      }

      const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
      if (!tokenData.access_token) {
        throw new UnauthorizedException(
          tokenData.error_description ??
            tokenData.error ??
            'Failed to obtain access token',
        );
      }

      const userResponse = await fetchWithTimeout(
        'https://api.github.com/user',
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${tokenData.access_token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      if (!userResponse.ok) {
        throw new UnauthorizedException('Failed to fetch GitHub user');
      }

      githubUser = (await userResponse.json()) as GitHubUserResponse;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadGatewayException('GitHub OAuth upstream failure', {
        cause: error,
      });
    }
    const githubId = String(githubUser.id);

    const [developer] = await this.db
      .select({ claimedAt: developers.claimedAt })
      .from(developers)
      .where(eq(developers.githubId, githubId))
      .limit(1);

    if (developer && developer.claimedAt == null) {
      await this.db
        .update(developers)
        .set({ claimedAt: new Date() })
        .where(eq(developers.githubId, githubId));
    }

    const payload: SessionPayload = {
      githubId,
      login: githubUser.login,
      avatarUrl: githubUser.avatar_url,
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      token,
      redirectUrl: this.getFrontendUrl(),
    };
  }

  async getSessionFromToken(
    token: string | undefined,
  ): Promise<SessionPayload | null> {
    if (!token) {
      return null;
    }

    try {
      return await this.jwtService.verifyAsync<SessionPayload>(token);
    } catch {
      return null;
    }
  }

  async getMe(session: SessionPayload) {
    const [developer] = await this.db
      .select({
        login: developers.login,
        avatarUrl: developers.avatarUrl,
      })
      .from(developers)
      .where(eq(developers.githubId, session.githubId))
      .limit(1);

    return {
      login: developer?.login ?? session.login,
      avatarUrl: developer?.avatarUrl ?? session.avatarUrl ?? null,
      hasProfile: !!developer,
    };
  }
}
