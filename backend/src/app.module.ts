import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiModule } from './api/api.module';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { SearchModule } from './search/search.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DbModule,
    SyncModule,
    DiscoveryModule,
    AuthModule,
    ApiModule,
    SearchModule,
  ],
})
export class AppModule {}
