import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [GithubService, SyncService],
  exports: [SyncService],
})
export class SyncModule {}
