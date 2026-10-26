import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HouseholdsModule } from '../households/households.module';
import { TasksModule } from '../tasks/tasks.module';
import { SetupController } from './setup.controller';
import { SetupGuard } from './setup.guard';
import { SetupService } from './setup.service';

@Module({
  imports: [AuthModule, HouseholdsModule, TasksModule],
  controllers: [SetupController],
  providers: [SetupService, SetupGuard],
  exports: [SetupService],
})
export class SetupModule {}
