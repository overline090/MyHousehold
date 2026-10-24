import { Injectable, Logger } from '@nestjs/common';
import { AssignmentMode, HouseholdRole, OccurrenceStatus, Prisma } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { assertAssignmentIsCoherent, assigneeForOrdinal } from './assignment';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
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
  category: true,
  rrule: true,
  dueTime: true,
  durationMinutes: true,
  assignmentMode: true,
  graceHours: true,
  points: true,
  isActive: true,
  startsOn: true,
  endsOn: true,
  createdAt: true,
  updatedAt: true,
  assignees: {
    select: { userId: true, position: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.TaskDefinitionSelect;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async create(householdId: string, createdById: string, dto: CreateTaskDto) {
    assertValidRrule(dto.rrule);
    const mode = dto.assignmentMode ?? AssignmentMode.ANYONE;
    const assignees = dto.assignees ?? [];
    assertAssignmentIsCoherent(mode, assignees);
    await this.assertAssigneesAreMembers(householdId, assignees);
    assertDateOrder(dto.startsOn, dto.endsOn);

    if (dto.id) {
      const existing = await this.prisma.taskDefinition.findUnique({
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

    const created = await this.prisma.taskDefinition.create({
      data: {
        id: dto.id,
        householdId,
        createdById,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        category: dto.category?.trim() ?? null,
        rrule: dto.rrule,
        dueTime: dto.dueTime ?? null,
        durationMinutes: dto.durationMinutes ?? null,
        assignmentMode: mode,
        graceHours: dto.graceHours ?? 24,
        points: dto.points ?? 1,
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

  async findAll(householdId: string, isActive?: boolean) {
    const tasks = await this.prisma.taskDefinition.findMany({
      where: {
        householdId,
        deletedAt: null,
        ...(isActive === undefined ? {} : { isActive }),
      },
      select: taskSelect,
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map(shapeTask);
  }

  async findOne(householdId: string, taskId: string) {
    const task = await this.prisma.taskDefinition.findFirst({
      where: { id: taskId, householdId, deletedAt: null },
      select: taskSelect,
    });

    if (!task) {
      throw AppException.notFound("Cette tâche n'existe pas.");
    }

    const upcoming = await this.prisma.taskOccurrence.findMany({
      where: {
        taskDefinitionId: taskId,
        deletedAt: null,
        status: OccurrenceStatus.PENDING,
      },
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
        scheduledFor: toLocalDate(o.scheduledFor),
      })),
    };
  }

  async update(householdId: string, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.taskDefinition.findFirst({
      where: { id: taskId, householdId, deletedAt: null },
      select: {
        id: true,
        assignmentMode: true,
        assignees: { select: { userId: true }, orderBy: { position: 'asc' } },
      },
    });

    if (!existing) {
      throw AppException.notFound("Cette tâche n'existe pas.");
    }

    if (dto.rrule !== undefined) {
      assertValidRrule(dto.rrule);
    }

    const mode = dto.assignmentMode ?? existing.assignmentMode;
    const assignees =
      dto.assignees ??
      (dto.assignmentMode ? [] : existing.assignees.map((a) => a.userId));
    assertAssignmentIsCoherent(mode, assignees);
    await this.assertAssigneesAreMembers(householdId, assignees);

    await this.prisma.$transaction(async (tx) => {
      await tx.taskDefinition.update({
        where: { id: taskId },
        data: {
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          category: dto.category?.trim(),
          rrule: dto.rrule,
          dueTime: dto.dueTime,
          durationMinutes: dto.durationMinutes,
          assignmentMode: dto.assignmentMode,
          graceHours: dto.graceHours,
          points: dto.points,
          isActive: dto.isActive,
          startsOn: dto.startsOn ? new Date(dto.startsOn) : undefined,
          endsOn: dto.endsOn ? new Date(dto.endsOn) : undefined,
        },
      });

      if (dto.assignees !== undefined || dto.assignmentMode !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskDefinitionId: taskId } });
        if (assignees.length > 0) {
          await tx.taskAssignee.createMany({
            data: assignees.map((userId, position) => ({
              taskDefinitionId: taskId,
              userId,
              position,
            })),
          });
        }
      }

      // Le passé ne se réécrit pas : seules les occurrences futures
      // encore en attente sont regénérées. Une tâche déjà faite reste
      // faite, même si la règle change ensuite.
      await tx.taskOccurrence.deleteMany({
        where: {
          taskDefinitionId: taskId,
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
    const existing = await this.prisma.taskDefinition.findFirst({
      where: { id: taskId, householdId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw AppException.notFound("Cette tâche n'existe pas.");
    }

    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.taskDefinition.update({
        where: { id: taskId },
        data: { deletedAt: now, isActive: false },
      }),
      this.prisma.taskOccurrence.updateMany({
        where: {
          taskDefinitionId: taskId,
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
   * Idempotent : l'unicité `(taskDefinitionId, scheduledFor)` et
   * `skipDuplicates` font qu'un passage rejoué ne crée rien de plus. Le
   * job peut donc être relancé sans précaution après une coupure.
   */
  async materializeDefinition(taskId: string): Promise<number> {
    const task = await this.prisma.taskDefinition.findFirst({
      where: { id: taskId, deletedAt: null, isActive: true },
      select: {
        id: true,
        householdId: true,
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

    const timezone = task.household.timezone;
    const today = todayIn(timezone, this.clock.now());
    const windowStart = shiftDays(today, -MATERIALIZATION_BACKFILL_DAYS);
    const windowEnd = shiftDays(today, MATERIALIZATION_HORIZON_DAYS);

    const seriesStart = task.startsOn
      ? toLocalDate(task.startsOn)
      : todayIn(timezone, task.createdAt);

    const generated = generateOccurrences(
      {
        rrule: task.rrule,
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
        taskDefinitionId: task.id,
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

  /** Passage du job : toutes les tâches actives de l'instance. */
  async materializeAll(): Promise<{ definitions: number; created: number }> {
    const tasks = await this.prisma.taskDefinition.findMany({
      where: { deletedAt: null, isActive: true, household: { deletedAt: null } },
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
        FROM task_definition d
       WHERE o."taskDefinitionId" = d.id
         AND o.status = 'PENDING'
         AND o."deletedAt" IS NULL
         AND o."dueAt" + (d."graceHours" * INTERVAL '1 hour') < ${now}
    `;

    if (updated > 0) {
      this.logger.log(`${updated} occurrence(s) marquée(s) manquée(s)`);
    }
    return updated;
  }

  private async assertAssigneesAreMembers(
    householdId: string,
    assignees: string[],
  ): Promise<void> {
    if (assignees.length === 0) {
      return;
    }

    const members = await this.prisma.householdMember.findMany({
      where: {
        householdId,
        userId: { in: assignees },
        deletedAt: null,
        // Un invité ne se voit pas assigner de tâche : il n'a pas le
        // droit de la compléter, ce serait une impasse.
        role: { in: [HouseholdRole.OWNER, HouseholdRole.ADULT, HouseholdRole.CHILD] },
      },
      select: { userId: true },
    });

    const known = new Set(members.map((m) => m.userId));
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

function shapeTask(task: {
  startsOn: Date | null;
  endsOn: Date | null;
  assignees: { userId: string }[];
}) {
  return {
    ...task,
    startsOn: task.startsOn ? toLocalDate(task.startsOn) : null,
    endsOn: task.endsOn ? toLocalDate(task.endsOn) : null,
    assignees: task.assignees.map((a) => a.userId),
  };
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
