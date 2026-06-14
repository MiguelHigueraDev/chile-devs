import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import { admins } from '../db/schema';
import type { SessionPayload } from '../auth/auth.types';

@Injectable()
export class AdminService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async isAdmin(session: SessionPayload): Promise<boolean> {
    const [byGithubId] = await this.db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.githubId, session.githubId))
      .limit(1);

    if (byGithubId) {
      return true;
    }

    // Admins are seeded by login, so the first time a seeded admin signs in we
    // backfill their stable GitHub id.
    const claimed = await this.db
      .update(admins)
      .set({ githubId: session.githubId })
      .where(
        and(
          eq(admins.login, session.login.toLowerCase()),
          isNull(admins.githubId),
        ),
      )
      .returning({ id: admins.id });

    return claimed.length > 0;
  }
}
