import { Injectable } from '@nestjs/common';
import { ActivityVerb, Right, OccurrenceStatus, Prisma } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CompleteOccurrenceDto,
  SkipOccurrenceDto,
  UpdateOccurrenceDto,
} from './dto/occurrence-actions.dto';
import { ListOccurrencesDto } from './dto/list-occurrences.dto';
import { shiftDays, todayIn } from './recurrence';

/**
 * Fenêtre pendant laquelle on peut décocher une tâche. Assez large pour
 * rattraper une erreur de la veille, assez courte pour que l'historique
 * ne soit pas réécrit des semaines après.
 */
export const UNCOMPLETE_WINDOW_HOURS = 48;

const occurrenceSelect = {
  id: true,
  taskDefinitionId: true,
  scheduledFor: true,
  dueAt: true,
  status: true,
  assigneeId: true,
  completedAt: true,
  completedById: true,
  note: true,
  updatedAt: true,
  task: { select: { title: true, points: true, category: true, graceHours: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  completedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TaskOccurrenceSelect;

type OccurrenceRow = Prisma.TaskOccurrenceGetPayload<{ select: typeof occurrenceSelect }>;

@Injectable()
export class OccurrencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Endpoint principal de l'application : ce qu'il y a à faire, sur une
   * fenêtre de jours.
   */
  async list(householdId: string, userId: string, query: ListOccurrencesDto) {
    const household = await this.prisma.household.findFirstOrThrow({
      where: { id: householdId },
      select: { timezone: true },
    });

    const today = todayIn(household.timezone, this.clock.now());
    const from = query.from ?? today;
    const to = query.to ?? shiftDays(today, 7);

    if (from > to) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'La date de fin précède la date de début.',
      );
    }

    const assigneeId = query.assigneeId === 'me' ? userId : query.assigneeId;

    const occurrences = await this.prisma.taskOccurrence.findMany({
      where: {
        householdId,
        deletedAt: null,
        scheduledFor: { gte: dateOnly(from), lte: dateOnly(to) },
        ...(assigneeId ? { assigneeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      select: occurrenceSelect,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: query.limit ?? 100,
    });

    return { data: occurrences.map(shapeOccurrence), nextCursor: null };
  }

  async complete(
    householdId: string,
    occurrenceId: string,
    userId: string,
    dto: CompleteOccurrenceDto,
  ) {
    const occurrence = await this.require(householdId, occurrenceId);
    const completedAt = this.resolveActionInstant(dto.completedAt);

    if (occurrence.status === OccurrenceStatus.DONE) {
      // Tolérance au rejeu : refaire la même action est un succès, pas un
      // conflit. Deux cas distincts le justifient :
      //   - un double tap, sans instant précisé : chaque envoi porterait
      //     un « maintenant » différent de quelques millisecondes, les
      //     comparer donnerait un conflit absurde avec soi-même ;
      //   - la file de mutations hors-ligne, qui renvoie l'instant réel
      //     de l'action et doit retrouver son résultat à l'identique.
      // Un conflit n'a de sens que si c'est quelqu'un d'autre qui avait
      // déjà fait la tâche.
      const sameUser = occurrence.completedById === userId;
      const sameInstant =
        dto.completedAt === undefined ||
        occurrence.completedAt?.getTime() === completedAt.getTime();

      if (sameUser && sameInstant) {
        return shapeOccurrence(occurrence);
      }

      throw AppException.conflict(
        ErrorCode.TASK_ALREADY_COMPLETED,
        `Cette tâche a déjà été faite par ${occurrence.completedBy?.firstName ?? 'quelqu’un'}.`,
        {
          completedBy: occurrence.completedBy?.firstName,
          completedAt: occurrence.completedAt?.toISOString(),
        },
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.taskOccurrence.update({
        where: { id: occurrenceId },
        data: {
          status: OccurrenceStatus.DONE,
          completedAt,
          completedById: userId,
          note: dto.note ?? occurrence.note,
        },
        select: occurrenceSelect,
      });

      await tx.activityLog.create({
        data: {
          householdId,
          actorId: userId,
          verb: ActivityVerb.TASK_COMPLETED,
          subjectType: 'TASK_OCCURRENCE',
          subjectId: occurrenceId,
          summary: `a fait « ${row.task.title} »`,
        },
      });

      return row;
    });

    return shapeOccurrence(updated);
  }

  /** Rattrapage d'une erreur de saisie, dans une fenêtre limitée. */
  async uncomplete(householdId: string, occurrenceId: string) {
    const occurrence = await this.require(householdId, occurrenceId);

    if (occurrence.status !== OccurrenceStatus.DONE) {
      throw AppException.conflict(
        ErrorCode.TASK_NOT_COMPLETED,
        "Cette tâche n'est pas marquée comme faite.",
      );
    }

    const completedAt = occurrence.completedAt ?? occurrence.dueAt;
    const elapsedHours = (this.clock.now().getTime() - completedAt.getTime()) / 3_600_000;

    if (elapsedHours > UNCOMPLETE_WINDOW_HOURS) {
      throw AppException.conflict(
        ErrorCode.UNCOMPLETE_WINDOW_CLOSED,
        `Une tâche ne peut être décochée que dans les ${UNCOMPLETE_WINDOW_HOURS} heures.`,
      );
    }

    const updated = await this.prisma.taskOccurrence.update({
      where: { id: occurrenceId },
      data: {
        status: OccurrenceStatus.PENDING,
        completedAt: null,
        completedById: null,
      },
      select: occurrenceSelect,
    });

    return shapeOccurrence(updated);
  }

  /** Passer son tour : la tâche n'est ni faite ni oubliée, elle est sautée. */
  async skip(
    householdId: string,
    occurrenceId: string,
    userId: string,
    dto: SkipOccurrenceDto,
  ) {
    const occurrence = await this.require(householdId, occurrenceId);

    if (occurrence.status === OccurrenceStatus.DONE) {
      throw AppException.conflict(
        ErrorCode.TASK_ALREADY_COMPLETED,
        'Cette tâche a déjà été faite.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.taskOccurrence.update({
        where: { id: occurrenceId },
        data: { status: OccurrenceStatus.SKIPPED, note: dto.note ?? occurrence.note },
        select: occurrenceSelect,
      });

      await tx.activityLog.create({
        data: {
          householdId,
          actorId: userId,
          verb: ActivityVerb.TASK_SKIPPED,
          subjectType: 'TASK_OCCURRENCE',
          subjectId: occurrenceId,
          summary: `a passé son tour sur « ${row.task.title} »`,
        },
      });

      return row;
    });

    return shapeOccurrence(updated);
  }

  /** Réassigner, reporter, annoter. */
  async update(householdId: string, occurrenceId: string, dto: UpdateOccurrenceDto) {
    await this.require(householdId, occurrenceId);

    if (dto.assigneeId) {
      await this.assertAssignable(dto.assigneeId);
    }

    const updated = await this.prisma.taskOccurrence.update({
      where: { id: occurrenceId },
      data: {
        // `null` est une valeur utile ici : elle rend l'occurrence
        // ouverte à tous. D'où la distinction avec `undefined`.
        assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        note: dto.note,
      },
      select: occurrenceSelect,
    });

    return shapeOccurrence(updated);
  }

  private async require(
    householdId: string,
    occurrenceId: string,
  ): Promise<OccurrenceRow> {
    const occurrence = await this.prisma.taskOccurrence.findFirst({
      where: { id: occurrenceId, householdId, deletedAt: null },
      select: occurrenceSelect,
    });

    if (!occurrence) {
      throw AppException.notFound("Cette occurrence n'existe pas.");
    }
    return occurrence;
  }

  /**
   * L'instant d'une action peut être antérieur — on déclare dimanche soir
   * une action faite samedi matin, ou une saisie hors-ligne remonte avec
   * sa date réelle. Jamais postérieur : antidater le futur n'a pas de
   * sens et fausserait les compteurs de retard.
   */
  private resolveActionInstant(value?: string): Date {
    const now = this.clock.now();
    if (!value) {
      return now;
    }

    const instant = new Date(value);
    if (instant.getTime() > now.getTime()) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "L'instant d'une action ne peut pas être dans le futur.",
      );
    }
    return instant;
  }

  private async assertAssignable(userId: string): Promise<void> {
    const member = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        status: { rights: { has: Right.COMPLETE_TASKS } },
      },
      select: { id: true },
    });

    if (!member) {
      throw AppException.badRequest(
        ErrorCode.INVALID_ASSIGNMENT,
        'Cette personne ne fait pas partie du foyer, ou ne peut pas se voir confier de tâche.',
      );
    }
  }
}

function shapeOccurrence(row: OccurrenceRow) {
  return {
    id: row.id,
    taskDefinitionId: row.taskDefinitionId,
    // Titre et points recopiés depuis la définition : l'app affiche une
    // liste sans résoudre les définitions, et reste lisible hors-ligne.
    title: row.task.title,
    category: row.task.category,
    points: row.task.points,
    scheduledFor: row.scheduledFor.toISOString().slice(0, 10),
    dueAt: row.dueAt,
    status: row.status,
    assignee: row.assignee,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    note: row.note,
    updatedAt: row.updatedAt,
  };
}

/** Jour pur vers l'instant que PostgreSQL stocke pour une colonne `date`. */
function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
