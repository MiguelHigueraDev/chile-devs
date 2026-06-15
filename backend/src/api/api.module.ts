import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SyncModule } from '../sync/sync.module';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';

@Module({
  imports: [AuthModule, SyncModule],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
