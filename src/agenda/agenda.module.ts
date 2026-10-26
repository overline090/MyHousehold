import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { HouseholdsModule } from '../households/households.module';
import { TasksModule } from '../tasks/tasks.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

@Module({
  imports: [HouseholdsModule, AppointmentsModule, TasksModule],
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
