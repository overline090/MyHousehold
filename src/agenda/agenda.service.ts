import { Injectable } from '@nestjs/common';
import { OccurrenceStatus, TaskKind } from '@prisma/client';
import { AppointmentsService } from '../appointments/appointments.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BackgroundState } from '../tasks/background-state';
import { TasksService } from '../tasks/tasks.service';
import { LocalDate } from '../tasks/recurrence';

export type AgendaEntryType = 'APPOINTMENT' | 'TASK' | 'BACKGROUND_DUE';

export interface AgendaEntry {
  type: AgendaEntryType;
  /** Identifiant de l'objet sous-jacent : occurrence, rendez-vous, tâche. */
  id: string;
  title: string;
  /** Instant qui sert au tri et à l'affichage. */
  at: Date;
  endAt?: Date;
  isAllDay?: boolean;
  location?: string | null;
  status?: string;
  priority?: number;
  assignee?: { id: string; firstName: string; lastName: string } | null;
}

/**
 * Vue fusionnée : ce qui attend le foyer sur une fenêtre, tous types
 * confondus.
 *
 * La fusion se fait côté serveur et non dans chaque client : sinon le
 * tri, les fuseaux et les règles de visibilité seraient réimplémentés
 * dans l'app Android, dans l'interface web, et dans tout ce qui viendra
 * ensuite.
 */
@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly tasks: TasksService,
  ) {}

  async list(
    householdId: string,
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ from: LocalDate; to: LocalDate; data: AgendaEntry[] }> {
    const [appointments, occurrences, deFond] = await Promise.all([
      this.appointments.list(householdId, userId, from, to),
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId,
          deletedAt: null,
          // Une occurrence sans date est celle d'une tâche de fond ou
          // d'une tâche ponctuelle sans échéance : rien à placer dans un
          // agenda.
          dueAt: { not: null },
          scheduledFor: {
            gte: new Date(`${from}T00:00:00Z`),
            lte: new Date(`${to}T00:00:00Z`),
          },
        },
        select: {
          id: true,
          dueAt: true,
          status: true,
          task: { select: { title: true, priority: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.tasks.findAll(householdId, { isActive: true, kind: TaskKind.BACKGROUND }),
    ]);

    const windowStart = new Date(`${from}T00:00:00Z`).getTime();
    const windowEnd = new Date(`${to}T23:59:59.999Z`).getTime();

    const entries: AgendaEntry[] = [
      ...appointments.map((appointment): AgendaEntry => ({
        type: 'APPOINTMENT',
        id: appointment.appointmentId,
        title: appointment.title,
        at: appointment.startAt,
        endAt: appointment.endAt,
        isAllDay: appointment.isAllDay,
        location: appointment.location,
      })),
      ...occurrences.map((occurrence): AgendaEntry => ({
        type: 'TASK',
        id: occurrence.id,
        title: occurrence.task.title,
        at: occurrence.dueAt as Date,
        status: occurrence.status,
        priority: occurrence.task.priority,
        assignee: occurrence.assignee,
      })),
      // Une tâche de fond n'a pas de date propre : elle n'entre dans
      // l'agenda que si son délai arrive à terme dans la fenêtre. Celles
      // qui sont déjà en retard y figurent aussi, sinon elles
      // disparaîtraient de la vue au moment où elles comptent le plus.
      ...deFond
        .filter(
          (tache) =>
            tache.nextDueAt != null &&
            (tache.state === BackgroundState.OVERDUE ||
              (tache.nextDueAt.getTime() >= windowStart &&
                tache.nextDueAt.getTime() <= windowEnd)),
        )
        .map((tache): AgendaEntry => ({
          type: 'BACKGROUND_DUE',
          id: tache.id,
          title: tache.title,
          at: tache.nextDueAt as Date,
          status: tache.state,
          priority: tache.priority,
        })),
    ];

    entries.sort((a, b) => a.at.getTime() - b.at.getTime());

    return { from, to, data: entries };
  }

  /** Raccourci de l'écran d'accueil : ce qui reste à faire aujourd'hui. */
  async pendingToday(householdId: string, userId: string, today: LocalDate) {
    const { data } = await this.list(householdId, userId, today, today);
    return data.filter(
      (entry) => entry.type !== 'TASK' || entry.status === OccurrenceStatus.PENDING,
    );
  }
}
