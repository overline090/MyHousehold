import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { OccurrencesService } from './occurrences.service';
import { TaskGroupsService } from './task-groups.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [TasksController],
  providers: [TasksService, OccurrencesService, TaskGroupsService],
  exports: [TasksService, TaskGroupsService],
})
export class TasksModule {}
