import { Module } from '@nestjs/common';
import { ReleasesModule } from '../releases/releases.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, SchedulerModule, ReleasesModule],
  controllers: [AdminController],
})
export class AdminModule {}
