import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { count, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from './db.module';
import { developerLanguages, developers } from './schema';

@Injectable()
export class LanguageBackfillService implements OnModuleInit {
  private readonly logger = new Logger(LanguageBackfillService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async onModuleInit() {
    await this.backfillIfNeeded();
  }

  async backfillIfNeeded(): Promise<number> {
    const [{ langRows }] = await this.db
      .select({ langRows: count() })
      .from(developerLanguages);

    const [{ devsWithLanguages }] = await this.db
      .select({ devsWithLanguages: count() })
      .from(developers)
      .where(sql`jsonb_array_length(${developers.topLanguages}) > 0`);

    if (langRows > 0 || devsWithLanguages === 0) {
      return 0;
    }

    this.logger.log(
      `developer_languages is empty but ${devsWithLanguages} developers have top_languages — backfilling...`,
    );

    const result = await this.db.execute(sql`
      INSERT INTO developer_languages (developer_github_id, language, share)
      SELECT
        d.github_id,
        lower(lang->>'name'),
        (lang->>'share')::integer
      FROM developers d
      CROSS JOIN LATERAL jsonb_array_elements(d.top_languages) AS lang
      WHERE lang->>'name' IS NOT NULL
      ON CONFLICT (developer_github_id, language)
      DO UPDATE SET share = EXCLUDED.share
    `);

    const inserted = Number(result.count ?? 0);
    this.logger.log(`Backfilled ${inserted} developer language rows`);
    return inserted;
  }
}
