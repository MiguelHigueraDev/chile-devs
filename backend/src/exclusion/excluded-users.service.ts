import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/db.module';
import {
  buildClearStaleRankingsSql,
  buildRankingUpdateSql,
} from '../db/ranking-sql';
import { developers, excludedUsers } from '../db/schema';

@Injectable()
export class ExcludedUsersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async isExcluded(githubId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ githubId: excludedUsers.githubId })
      .from(excludedUsers)
      .where(eq(excludedUsers.githubId, githubId))
      .limit(1);

    return !!row;
  }

  async loadExcludedGithubIds(): Promise<Set<string>> {
    const rows = await this.db
      .select({ githubId: excludedUsers.githubId })
      .from(excludedUsers);

    return new Set(rows.map((row) => row.githubId));
  }

  async excludeUser(
    githubId: string,
    login: string,
  ): Promise<{ deletedProfile: boolean }> {
    let deletedProfile = false;

    await this.db.transaction(async (tx) => {
      await tx
        .insert(excludedUsers)
        .values({ githubId, login })
        .onConflictDoNothing();

      const deleted = await tx
        .delete(developers)
        .where(eq(developers.githubId, githubId))
        .returning({ githubId: developers.githubId });

      deletedProfile = deleted.length > 0;
    });

    if (deletedProfile) {
      await this.refreshRankings();
    }

    return { deletedProfile };
  }

  private async refreshRankings(): Promise<void> {
    await this.db.execute(buildClearStaleRankingsSql());
    await this.db.execute(buildRankingUpdateSql());
  }
}
