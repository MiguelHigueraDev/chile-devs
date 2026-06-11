import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from './db.tokens';

@Injectable()
export class LanguageBackfillService implements OnModuleInit {
  private readonly logger = new Logger(LanguageBackfillService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async onModuleInit() {
    await this.backfillIfNeeded();
  }

  async backfillIfNeeded(): Promise<number> {
    const rows = await this.db.execute<{ needs_backfill: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM developers d
        CROSS JOIN LATERAL jsonb_array_elements(d.top_languages) AS lang
        WHERE lang->>'name' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM developer_languages dl
          WHERE dl.developer_github_id = d.github_id
          AND dl.language = lower(lang->>'name')
        )
      ) AS needs_backfill
    `);

    if (!rows[0]?.needs_backfill) {
      return 0;
    }

    this.logger.log(
      'Some developer language rows are missing — backfilling from top_languages...',
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
