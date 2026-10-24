import { Module } from '@nestjs/common';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { ServerAdminGuard } from './server-admin.guard';

@Module({
  imports: [UsersModule, SchedulerModule],
  controllers: [AdminController],
  providers: [ServerAdminGuard],
})
export class AdminModule {}
