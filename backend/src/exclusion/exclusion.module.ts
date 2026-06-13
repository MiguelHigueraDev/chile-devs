import { Module } from '@nestjs/common';
import { ExcludedUsersService } from './excluded-users.service';

@Module({
  providers: [ExcludedUsersService],
  exports: [ExcludedUsersService],
})
export class ExclusionModule {}
