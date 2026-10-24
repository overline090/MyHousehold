import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobName, TASKS_QUEUE } from './job-names';

/**
 * Planification des balayages. Les intervalles sont volontairement courts
 * par rapport à ce qu'ils surveillent : un passage manqué est rattrapé au
 * suivant, puisque les jobs sont idempotents.
 */
const SCHEDULES: { name: string; pattern: string; description: string }[] = [
  {
    name: JobName.MATERIALIZE,
    pattern: '7 * * * *',
    description: 'matérialisation des occurrences, une fois par heure',
  },
  {
    name: JobName.MARK_MISSED,
    pattern: '*/15 * * * *',
    description: 'passage en « manquée », tous les quarts d’heure',
  },
];

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(@InjectQueue(TASKS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.registerSchedules();
    } catch (error) {
      // Redis indisponible ne doit pas empêcher le serveur de répondre :
      // l'API reste utilisable, seuls les balayages automatiques
      // manquent. /health le signale.
      this.logger.error(
        `Planification impossible (Redis injoignable ?) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async registerSchedules(): Promise<void> {
    const wanted = new Set(SCHEDULES.map((s) => s.name));

    // Les planifications d'une version antérieure survivent dans Redis :
    // on retire celles qui n'existent plus, sinon la file accumule des
    // jobs que personne ne traite.
    const existing = await this.queue.getJobSchedulers();
    for (const scheduler of existing) {
      if (scheduler.key && !wanted.has(scheduler.key)) {
        await this.queue.removeJobScheduler(scheduler.key);
        this.logger.log(`Planification obsolète retirée : ${scheduler.key}`);
      }
    }

    for (const schedule of SCHEDULES) {
      await this.queue.upsertJobScheduler(
        schedule.name,
        { pattern: schedule.pattern },
        { name: schedule.name },
      );
      this.logger.log(`Planifié : ${schedule.description}`);
    }
  }

  /** Déclenche un balayage immédiat, sans attendre le prochain passage. */
  async runNow(name: string): Promise<void> {
    await this.queue.add(name, {}, { removeOnComplete: true });
  }
}
