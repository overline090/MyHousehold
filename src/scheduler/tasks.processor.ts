import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReleasesService } from '../releases/releases.service';
import { TasksService } from '../tasks/tasks.service';
import { JobName, TASKS_QUEUE } from './job-names';

/**
 * Les deux jobs sont des balayages idempotents : rejouer un passage ne
 * crée rien en double et ne corrompt rien. C'est ce qui permet de les
 * relancer sans précaution après une coupure de courant — cas banal sur
 * un serveur domestique.
 */
@Processor(TASKS_QUEUE)
export class TasksProcessor extends WorkerHost {
  private readonly logger = new Logger(TasksProcessor.name);

  constructor(
    private readonly tasks: TasksService,
    private readonly releases: ReleasesService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JobName.MATERIALIZE:
        return this.tasks.materializeAll();

      case JobName.MARK_MISSED:
        return { missed: await this.tasks.markMissed() };

      case JobName.CHECK_RELEASES:
        return this.releases.check();

      default:
        // Un job inconnu vient d'une version antérieure restée dans
        // Redis : on le signale sans faire échouer la file.
        this.logger.warn(`Job ignoré, nom inconnu : ${job.name}`);
        return null;
    }
  }
}
