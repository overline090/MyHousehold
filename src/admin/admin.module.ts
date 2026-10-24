import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { ServerAdminGuard } from './server-admin.guard';

@Module({
  imports: [UsersModule],
  controllers: [AdminController],
  providers: [ServerAdminGuard],
})
export class AdminModule {}
