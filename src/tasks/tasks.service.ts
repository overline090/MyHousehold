import { Injectable, Logger } from '@nestjs/common';
import {
  ActivityVerb,
  AssignmentMode,
  OccurrenceStatus,
  Prisma,
  Right,
  TaskKind,
} from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { assertAssignmentIsCoherent, assigneeForOrdinal } from './assignment';
import { BackgroundStateInfo, deriveBackgroundState } from './background-state';
import { CreateTaskDto } from './dto/create-task.dto';
import { versForme } from './dto/recurrence.dto';
import { formToRrule, rruleToForm } from './recurrence-forms';
import { MarkDoneDto } from './dto/mark-done.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  assertChampsCoherents,
  assertRecurrenceRequise,
  assertRotationApplicable,
} from './task-kind';
import {
  assertValidRrule,
  generateOccurrences,
  LocalDate,
  shiftDays,
  todayIn,
} from './recurrence';

/**
 * Horizon de matérialisation : on crée les occurrences jusqu'à 60 jours
 * en avant. Borné, parce qu'une règle sans date de fin déroulerait
 * l'infini.
 */
export const MATERIALIZATION_HORIZON_DAYS = 60;

/**
 * On matérialise aussi un peu de passé : si le serveur est resté éteint
 * une semaine, les occurrences de la semaine écoulée doivent exister pour
 * pouvoir être cochées ou marquées manquées.
 */
const MATERIALIZATION_BACKFILL_DAYS = 14;

const taskSelect = {
  id: true,
  householdId: true,
  title: true,
  description: true,
  kind: true,
  priority: true,
  rrule: true,
  dueTime: true,
  graceHours: true,
  maxIntervalSeconds: true,
  warnRatio: true,
  dueDate: true,
  assignmentMode: true,
  isActive: true,
  startsOn: true,
  endsOn: true,
  createdAt: true,
  updatedAt: true,
  group: { select: { id: true, name: true, color: true } },
  assignees: {
    select: { userId: true, position: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async create(householdId: string, createdById: string, dto: CreateTaskDto) {
    const kind = dto.kind ?? TaskKind.SCHEDULED;
    const rrule = dto.recurrence ? formToRrule(versForme(dto.recurrence)) : dto.rrule;
    assertChampsCoherents(kind, {
      rrule,
      dueTime: dto.dueTime,
      graceHours: dto.graceHours,
      startsOn: dto.startsOn,
      endsOn: dto.endsOn,
      maxIntervalSeconds: dto.maxIntervalSeconds,
      warnRatio: dto.warnRatio,
      dueDate: dto.dueDate,
    });
    assertRecurrenceRequise(kind, rrule);
    if (rrule) {
      assertValidRrule(rrule);
    }

    const mode = dto.assignmentMode ?? AssignmentMode.ANYONE;
    const assignees = dto.assignees ?? [];
    assertRotationApplicable(kind, mode);
    assertAssignmentIsCoherent(mode, assignees);
    await this.assertAssigneesPeuventCompleter(assignees);
    assertDateOrder(dto.startsOn, dto.endsOn);
    await this.assertGroupeDuFoyer(householdId, dto.groupId ?? null);

    if (dto.id) {
      const existing = await this.prisma.task.findUnique({
        where: { id: dto.id },
        select: { id: true, householdId: true },
      });
      // Création idempotente : un envoi rejoué après une coupure réseau
      // ne doit pas créer une seconde tâche.
      if (existing) {
        if (existing.householdId !== householdId) {
          throw AppException.notFound();
        }
        return this.findOne(householdId, existing.id);
      }
    }

    const created = await this.prisma.task.create({
      data: {
        id: dto.id,
        householdId,
        createdById,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        kind,
        groupId: dto.groupId ?? null,
        priority: dto.priority ?? 0,
        rrule: rrule ?? null,
        dueTime: dto.dueTime ?? null,
        graceHours: dto.graceHours ?? 24,
        maxIntervalSeconds: dto.maxIntervalSeconds ?? null,
        warnRatio: dto.warnRatio ?? 0.8,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignmentMode: mode,
        isActive: dto.isActive ?? true,
        startsOn: dto.startsOn ? new Date(dto.startsOn) : null,
        endsOn: dto.endsOn ? new Date(dto.endsOn) : null,
        assignees: {
          create: assignees.map((userId, position) => ({ userId, position })),
        },
      },
      select: { id: true },
    });

    // Matérialisation immédiate, et pas seulement au prochain passage du
    // job : on vient de créer la tâche, on s'attend à voir ses
    // prochaines échéances tout de suite.
    await this.materializeDefinition(created.id);

    return this.findOne(householdId, created.id);
  }

  async findAll(
    householdId: string,
    filtres: { isActive?: boolean; kind?: TaskKind; groupId?: string } = {},
  ) {
    const tasks = await this.prisma.task.findMany({
      where: {
        householdId,
        deletedAt: null,
        ...(filtres.isActive === undefined ? {} : { isActive: filtres.isActive }),
        ...(filtres.kind === undefined ? {} : { kind: filtres.kind }),
        ...(filtres.groupId === undefined ? {} : { groupId: filtres.groupId }),
      },
      select: taskSelect,
      // Le plus urgent d'abord : c'est l'ordre dans lequel une liste de
      // corvées se lit.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const etats = await this.etatsDeFond(tasks);
    return tasks.map((task) => shapeTask(task, etats.get(task.id)));
  }

  async findOne(householdId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, householdId, deletedAt: null },
      select: taskSelect,
    });

    if (!task) {
      throw AppException.notFound("Cette tâche n'existe pas.");
    }

    // Une tâche de fond n'a pas d'échéances à venir : ce qu'on veut voir
    // d'elle, c'est quand elle a été faite — le journal qui faisait
    // l'intérêt des anciens compteurs, et qui est conservé.
    if (task.kind === TaskKind.BACKGROUND) {
      const history = await this.prisma.taskOccurrence.findMany({
        where: { taskId, deletedAt: null, status: OccurrenceStatus.DONE },
        select: {
          id: true,
          completedAt: true,
          note: true,
          completedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 20,
      });

      const etats = await this.etatsDeFond([task]);
      return { ...shapeTask(task, etats.get(task.id)), history };
    }

    const upcoming = await this.prisma.taskOccurrence.findMany({
      where: { taskId, deletedAt: null, status: OccurrenceStatus.PENDING },
      select: {
        id: true,
        scheduledFor: true,
        dueAt: true,
        assigneeId: true,
        status: true,
      },
      orderBy: { scheduledFor: 'asc' },
      take: 10,
    });

    return {
      ...shapeTask(task),
      upcoming: upcoming.map((o) => ({
        ...o,
        scheduledFor: o.scheduledFor ? toLocalDate(o.scheduledFor) : null,
      })),
    };
  }

  /**
   * Déclarer une tâche de fond faite. Chaque complétion crée une
   * occurrence datée : c'est un journal, et deux saisies hors-ligne
   * concurrentes sont deux faits, pas un conflit.
   */
  async markDone(
    householdId: string,
    taskId: string,
    userId: string,
    dto: MarkDoneDto,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, householdId, deletedAt: null },
      select: { id: true, kind: true, title: true },
    });

    if (!task) {
      throw AppException.notFound("Cette tâche n'existe pas.");
    }

    if (task.kind !== TaskKind.BACKGROUND) {
      throw AppException.badRequest(
        ErrorCode.FIELD_NOT_APPLICABLE,
        'Cette route est celle des tâches de fond. Une tâche datée se coche par son occurrence.',
        { kind: task.kind },
      );
    }

    const completedAt = this.instantPasse(dto.completedAt);

    // L'UUID client rend l'appel idempotent : un double tap ou un rejeu
    // hors-ligne ne crée pas deux entrées.
    if (dto.id) {
      const existante = await this.prisma.taskOccurrence.findUnique({
        where: { id: dto.id },
        select: { id: true, taskId: true },
      });
      if (existante) {
        if (existante.taskId !== taskId) {
          throw AppException.notFound();
        }
        return this.findOne(householdId, taskId);
      }
    }

    await this.prisma.$transaction([
      this.prisma.taskOccurrence.create({
        data: {
          id: dto.id,
          taskId,
          householdId,
          status: OccurrenceStatus.DONE,
          completedAt,
          completedById: userId,
          note: dto.note?.trim() ?? null,
        },
      }),
      this.prisma.activityLog.create({
        data: {
          householdId,
          actorId: userId,
          verb: ActivityVerb.BACKGROUND_TASK_DONE,
          summary: `a fait « ${task.title} »`,
          subjectType: 'task',
          subjectId: taskId,
        },
      }),
    ]);

    return this.findOne(householdId, taskId);
  }

  async update(householdId: string, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, householdId, deletedAt: null },
      select: {
        id: true,
        kind: true,
        assignmentMode: true,
        assignees: { select: { userId: true }, orderBy: { position: 'asc' } },
      },
    });

    if (!existing) {
      throw AppException.notFound("Cette tâche n'existe pas.");
    }

    // Le type ne change pas après coup : une tâche récurrente devenue
    // tâche de fond laisserait derrière elle des occurrences datées que
    // plus rien ne saurait lire.
    if (dto.kind !== undefined && dto.kind !== existing.kind) {
      throw AppException.badRequest(
        ErrorCode.FIELD_NOT_APPLICABLE,
        "Le type d'une tâche ne se change pas. Créez-en une autre et supprimez celle-ci.",
        { kind: existing.kind },
      );
    }

    const rrule = dto.recurrence ? formToRrule(versForme(dto.recurrence)) : dto.rrule;

    assertChampsCoherents(existing.kind, {
      rrule,
      dueTime: dto.dueTime,
      graceHours: dto.graceHours,
      startsOn: dto.startsOn,
      endsOn: dto.endsOn,
      maxIntervalSeconds: dto.maxIntervalSeconds,
      warnRatio: dto.warnRatio,
      dueDate: dto.dueDate,
    });

    if (rrule !== undefined) {
      assertValidRrule(rrule);
    }

    await this.assertGroupeDuFoyer(householdId, dto.groupId ?? null);

    const mode = dto.assignmentMode ?? existing.assignmentMode;
    const assignees =
      dto.assignees ??
      (dto.assignmentMode ? [] : existing.assignees.map((a) => a.userId));
    assertRotationApplicable(existing.kind, mode);
    assertAssignmentIsCoherent(mode, assignees);
    await this.assertAssigneesPeuventCompleter(assignees);

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          groupId: dto.groupId === undefined ? undefined : dto.groupId,
          priority: dto.priority,
          rrule,
          dueTime: dto.dueTime,
          graceHours: dto.graceHours,
          maxIntervalSeconds: dto.maxIntervalSeconds,
          warnRatio: dto.warnRatio,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          assignmentMode: dto.assignmentMode,
          isActive: dto.isActive,
          startsOn: dto.startsOn ? new Date(dto.startsOn) : undefined,
          endsOn: dto.endsOn ? new Date(dto.endsOn) : undefined,
        },
      });

      if (dto.assignees !== undefined || dto.assignmentMode !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId } });
        if (assignees.length > 0) {
          await tx.taskAssignee.createMany({
            data: assignees.map((userId, position) => ({ taskId, userId, position })),
          });
        }
      }

      // Le passé ne se réécrit pas : seules les occurrences futures
      // encore en attente sont regénérées. Une tâche déjà faite reste
      // faite, même si la règle change ensuite.
      await tx.taskOccurrence.deleteMany({
        where: {
          taskId,
          status: OccurrenceStatus.PENDING,
          dueAt: { gt: this.clock.now() },
        },
      });
    });

    await this.materializeDefinition(taskId);
    return this.findOne(householdId, taskId);
  }

  /**
   * Suppression logique. Les occurrences faites sont conservées — elles
   * sont l'historique du foyer — seules les futures en attente
   * disparaissent.
   */
  async remove(householdId: string, taskId: string): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, householdId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw AppException.notFound("Cette tâche n'existe pas.");
    }

    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: taskId },
        data: { deletedAt: now, isActive: false },
      }),
      this.prisma.taskOccurrence.updateMany({
        where: {
          taskId,
          status: OccurrenceStatus.PENDING,
          deletedAt: null,
        },
        data: { deletedAt: now },
      }),
    ]);
  }

  /**
   * Crée les occurrences manquantes d'une tâche sur la fenêtre courante.
   *
   * Idempotent : l'unicité `(taskId, scheduledFor)` et
   * `skipDuplicates` font qu'un passage rejoué ne crée rien de plus. Le
   * job peut donc être relancé sans précaution après une coupure.
   */
  async materializeDefinition(taskId: string): Promise<number> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null, isActive: true },
      select: {
        id: true,
        householdId: true,
        kind: true,
        dueDate: true,
        rrule: true,
        dueTime: true,
        assignmentMode: true,
        startsOn: true,
        endsOn: true,
        createdAt: true,
        household: { select: { timezone: true } },
        assignees: { select: { userId: true }, orderBy: { position: 'asc' } },
      },
    });

    if (!task) {
      return 0;
    }

    // Une tâche de fond n'a pas d'échéance à matérialiser : son état se
    // dérive de sa dernière complétion. Une tâche ponctuelle en a une
    // seule, posée à la création.
    if (task.kind === TaskKind.BACKGROUND) {
      return 0;
    }

    if (task.kind === TaskKind.ONE_OFF) {
      return this.materializeOneOff(task);
    }

    const timezone = task.household.timezone;
    const today = todayIn(timezone, this.clock.now());
    const windowStart = shiftDays(today, -MATERIALIZATION_BACKFILL_DAYS);
    const windowEnd = shiftDays(today, MATERIALIZATION_HORIZON_DAYS);

    const seriesStart = task.startsOn
      ? toLocalDate(task.startsOn)
      : todayIn(timezone, task.createdAt);

    const generated = generateOccurrences(
      {
        rrule: task.rrule ?? '',
        timezone,
        seriesStart,
        seriesEnd: task.endsOn ? toLocalDate(task.endsOn) : null,
        dueTime: task.dueTime,
      },
      windowStart,
      windowEnd,
    );

    if (generated.length === 0) {
      return 0;
    }

    const assigneeIds = task.assignees.map((a) => a.userId);
    const { count } = await this.prisma.taskOccurrence.createMany({
      data: generated.map((occurrence) => ({
        taskId: task.id,
        householdId: task.householdId,
        scheduledFor: new Date(`${occurrence.scheduledFor}T00:00:00Z`),
        dueAt: occurrence.dueAt,
        assigneeId: assigneeForOrdinal(
          task.assignmentMode,
          assigneeIds,
          occurrence.ordinal,
        ),
      })),
      skipDuplicates: true,
    });

    return count;
  }

  /**
   * Une tâche ponctuelle n'a qu'une occurrence, et seulement si elle
   * n'en a pas déjà : sans cela, la cocher puis relancer le job en
   * referait une, et elle serait à faire deux fois.
   */
  private async materializeOneOff(task: {
    id: string;
    householdId: string;
    dueDate: Date | null;
    assignmentMode: AssignmentMode;
    assignees: { userId: string }[];
  }): Promise<number> {
    const dejaLa = await this.prisma.taskOccurrence.count({
      where: { taskId: task.id, deletedAt: null },
    });

    if (dejaLa > 0) {
      return 0;
    }

    await this.prisma.taskOccurrence.create({
      data: {
        taskId: task.id,
        householdId: task.householdId,
        // Sans date limite, l'occurrence n'en porte pas : « un jour »
        // est une réponse acceptable, et elle attendra dans la liste.
        scheduledFor: task.dueDate,
        dueAt: task.dueDate ? finDeJournee(task.dueDate) : null,
        assigneeId: assigneeForOrdinal(
          task.assignmentMode,
          task.assignees.map((a) => a.userId),
          0,
        ),
      },
    });

    return 1;
  }

  /** Passage du job : toutes les tâches actives du foyer. */
  async materializeAll(): Promise<{ definitions: number; created: number }> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        household: { deletedAt: null },
        kind: { in: [TaskKind.SCHEDULED, TaskKind.ONE_OFF] },
      },
      select: { id: true },
    });

    let created = 0;
    for (const task of tasks) {
      created += await this.materializeDefinition(task.id);
    }

    if (created > 0) {
      this.logger.log(
        `${created} occurrence(s) créée(s) pour ${tasks.length} tâche(s) active(s)`,
      );
    }
    return { definitions: tasks.length, created };
  }

  /**
   * Marque manquées les occurrences dépassées.
   *
   * C'est un job et non un calcul à l'affichage : « manquée » est un fait
   * daté qu'on veut dans l'historique, et un client hors-ligne a besoin
   * d'un état stable à synchroniser.
   */
  async markMissed(): Promise<number> {
    const now = this.clock.now();

    // Le délai de grâce dépend de la tâche, donc comparaison en SQL
    // plutôt qu'un aller-retour par occurrence.
    const updated = await this.prisma.$executeRaw`
      UPDATE task_occurrence o
         SET status = 'MISSED', "updatedAt" = ${now}
        FROM task d
       WHERE o."taskId" = d.id
         AND d."kind" = 'SCHEDULED'
         AND o.status = 'PENDING'
         AND o."deletedAt" IS NULL
         AND o."dueAt" IS NOT NULL
         AND o."dueAt" + (d."graceHours" * INTERVAL '1 hour') < ${now}
    `;

    if (updated > 0) {
      this.logger.log(`${updated} occurrence(s) marquée(s) manquée(s)`);
    }
    return updated;
  }

  /**
   * L'état d'une tâche de fond se dérive de sa dernière complétion,
   * jamais d'un champ stocké : une complétion peut être déclarée dans le
   * passé ou corrigée, ce qui invaliderait n'importe quel cache.
   */
  private async etatsDeFond(
    tasks: { id: string; kind: TaskKind; maxIntervalSeconds: number | null; warnRatio: Prisma.Decimal }[],
  ): Promise<Map<string, BackgroundStateInfo & { lastDoneAt: Date | null }>> {
    const deFond = tasks.filter((task) => task.kind === TaskKind.BACKGROUND);
    const etats = new Map<string, BackgroundStateInfo & { lastDoneAt: Date | null }>();

    if (deFond.length === 0) {
      return etats;
    }

    // Une seule requête pour toute la liste : un `max()` par tâche, sur
    // l'index qui porte déjà la complétion.
    const dernieres = await this.prisma.taskOccurrence.groupBy({
      by: ['taskId'],
      where: {
        taskId: { in: deFond.map((task) => task.id) },
        status: OccurrenceStatus.DONE,
        deletedAt: null,
      },
      _max: { completedAt: true },
    });

    const parTache = new Map(
      dernieres.map((ligne) => [ligne.taskId, ligne._max.completedAt ?? null]),
    );

    const now = this.clock.now();
    for (const task of deFond) {
      const lastDoneAt = parTache.get(task.id) ?? null;
      etats.set(task.id, {
        lastDoneAt,
        ...deriveBackgroundState({
          lastDoneAt,
          maxIntervalSeconds: task.maxIntervalSeconds,
          warnRatio: Number(task.warnRatio),
          now,
        }),
      });
    }

    return etats;
  }

  /** Un groupe d'un autre foyer n'existe pas pour celui-ci. */
  private async assertGroupeDuFoyer(
    householdId: string,
    groupId: string | null,
  ): Promise<void> {
    if (!groupId) {
      return;
    }

    const groupe = await this.prisma.taskGroup.findFirst({
      where: { id: groupId, householdId, deletedAt: null },
      select: { id: true },
    });

    if (!groupe) {
      throw AppException.notFound("Ce groupe de tâches n'existe pas.");
    }
  }

  /** Une action se déclare dans le passé, jamais dans le futur. */
  private instantPasse(valeur?: string): Date {
    const instant = valeur ? new Date(valeur) : this.clock.now();

    if (Number.isNaN(instant.getTime())) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, 'Instant illisible.');
    }

    if (instant.getTime() > this.clock.now().getTime()) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "L'instant d'une action ne peut pas être dans le futur.",
      );
    }

    return instant;
  }

  private async assertAssigneesPeuventCompleter(assignees: string[]): Promise<void> {
    if (assignees.length === 0) {
      return;
    }

    const members = await this.prisma.user.findMany({
      where: {
        id: { in: assignees },
        deletedAt: null,
        // Une personne sans le droit de compléter ne se voit pas
        // assigner de tâche : ce serait une impasse.
        status: { rights: { has: Right.COMPLETE_TASKS } },
      },
      select: { id: true },
    });

    const known = new Set(members.map((m) => m.id));
    const unknown = assignees.filter((id) => !known.has(id));

    if (unknown.length > 0) {
      throw AppException.badRequest(
        ErrorCode.INVALID_ASSIGNMENT,
        'Une personne assignée ne fait pas partie du foyer, ou ne peut pas se voir confier de tâche.',
        { unknown },
      );
    }
  }
}

function shapeTask(
  task: TaskRow,
  etat?: BackgroundStateInfo & { lastDoneAt: Date | null },
) {
  const { warnRatio, ...reste } = task;

  return {
    ...reste,
    warnRatio: Number(warnRatio),
    // La forme plutôt que la règle brute : c'est ce que l'interface
    // montre. `null` quand la règle sort de ce que les cinq formes
    // savent dire — une règle affichée de travers serait pire.
    recurrence: task.rrule ? rruleToForm(task.rrule) : null,
    startsOn: task.startsOn ? toLocalDate(task.startsOn) : null,
    endsOn: task.endsOn ? toLocalDate(task.endsOn) : null,
    dueDate: task.dueDate ? toLocalDate(task.dueDate) : null,
    assignees: task.assignees.map((a) => a.userId),
    // Les champs d'état n'existent que pour une tâche de fond : les
    // mettre à null partout ferait croire qu'ils veulent dire quelque
    // chose sur les autres.
    ...(etat
      ? {
          lastDoneAt: etat.lastDoneAt,
          elapsedSeconds: etat.elapsedSeconds,
          state: etat.status,
          nextDueAt: etat.nextDueAt,
        }
      : {}),
  };
}

/**
 * Une tâche « du jour » n'est pas en retard à 00 h 01 : son échéance est
 * la fin de la journée locale. Faute de connaître ici le fuseau du
 * foyer, on prend la fin de la journée UTC, ce qui décale d'au plus
 * quelques heures une date limite déjà approximative.
 */
function finDeJournee(jour: Date): Date {
  return new Date(jour.getTime() + 24 * 3600 * 1000 - 1000);
}

/** Une colonne `date` PostgreSQL revient en Date à minuit UTC. */
function toLocalDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

function assertDateOrder(startsOn?: string, endsOn?: string): void {
  if (startsOn && endsOn && startsOn > endsOn) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      'La date de fin précède la date de début.',
    );
  }
}
