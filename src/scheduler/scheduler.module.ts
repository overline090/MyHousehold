import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TasksModule } from '../tasks/tasks.module';
import { TASKS_QUEUE } from './job-names';
import { SchedulerService } from './scheduler.service';
import { TasksProcessor } from './tasks.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            // Exigé par BullMQ pour ses workers : sans cela, ioredis
            // abandonne une commande bloquante et le worker meurt.
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 50,
            removeOnFail: 100,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: TASKS_QUEUE }),
    TasksModule,
  ],
  providers: [SchedulerService, TasksProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
