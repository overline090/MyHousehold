import { Injectable } from '@nestjs/common';
import { OccurrenceStatus } from '@prisma/client';
import { AppointmentsService } from '../appointments/appointments.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CountersService } from '../counters/counters.service';
import { CounterStatus } from '../counters/counter-status';
import { LocalDate } from '../tasks/recurrence';

export type AgendaEntryType = 'APPOINTMENT' | 'TASK' | 'COUNTER_DUE';

export interface AgendaEntry {
  type: AgendaEntryType;
  /** Identifiant de l'objet sous-jacent : occurrence, rendez-vous, compteur. */
  id: string;
  title: string;
  /** Instant qui sert au tri et à l'affichage. */
  at: Date;
  endAt?: Date;
  isAllDay?: boolean;
  location?: string | null;
  status?: string;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  points?: number;
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
    private readonly counters: CountersService,
  ) {}

  async list(
    householdId: string,
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ from: LocalDate; to: LocalDate; data: AgendaEntry[] }> {
    const [appointments, occurrences, counters] = await Promise.all([
      this.appointments.list(householdId, userId, from, to),
      this.prisma.taskOccurrence.findMany({
        where: {
          householdId,
          deletedAt: null,
          scheduledFor: {
            gte: new Date(`${from}T00:00:00Z`),
            lte: new Date(`${to}T00:00:00Z`),
          },
        },
        select: {
          id: true,
          dueAt: true,
          status: true,
          task: { select: { title: true, points: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.counters.findAll(householdId, true),
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
        at: occurrence.dueAt,
        status: occurrence.status,
        assignee: occurrence.assignee,
        points: occurrence.task.points,
      })),
      // Un compteur n'a pas de date propre : il n'entre dans l'agenda que
      // s'il arrive à échéance dans la fenêtre. Ceux qui sont déjà en
      // retard y figurent aussi, sinon ils disparaîtraient de la vue au
      // moment où ils comptent le plus.
      ...counters
        .filter(
          (counter) =>
            counter.nextDueAt !== null &&
            (counter.status === CounterStatus.OVERDUE ||
              (counter.nextDueAt.getTime() >= windowStart &&
                counter.nextDueAt.getTime() <= windowEnd)),
        )
        .map((counter): AgendaEntry => ({
          type: 'COUNTER_DUE',
          id: counter.id,
          title: counter.title,
          at: counter.nextDueAt as Date,
          status: counter.status,
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
