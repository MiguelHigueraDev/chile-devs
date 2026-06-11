import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { LanguageBackfillService } from './language-backfill.service';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DrizzleDB => {
        const connectionString = config.getOrThrow<string>('DATABASE_URL');
        const client = postgres(connectionString, { max: 10 });
        return drizzle(client, { schema });
      },
    },
    LanguageBackfillService,
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
