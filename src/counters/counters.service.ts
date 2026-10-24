import { Injectable } from '@nestjs/common';
import { ActivityVerb, Prisma } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { CounterState, deriveCounterState } from './counter-status';
import {
  CreateCounterDto,
  CreateCounterEventDto,
  ListCounterEventsDto,
  UpdateCounterDto,
} from './dto/counter.dto';

const counterSelect = {
  id: true,
  householdId: true,
  title: true,
  description: true,
  category: true,
  targetIntervalSeconds: true,
  warnRatio: true,
  assignmentMode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CounterDefinitionSelect;

type CounterRow = Prisma.CounterDefinitionGetPayload<{ select: typeof counterSelect }>;

const eventSelect = {
  id: true,
  counterDefinitionId: true,
  occurredAt: true,
  note: true,
  createdAt: true,
  recordedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.CounterEventSelect;

@Injectable()
export class CountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async create(householdId: string, createdById: string, dto: CreateCounterDto) {
    if (dto.id) {
      const existing = await this.prisma.counterDefinition.findUnique({
        where: { id: dto.id },
        select: { id: true, householdId: true },
      });
      if (existing) {
        if (existing.householdId !== householdId) {
          throw AppException.notFound();
        }
        return this.findOne(householdId, existing.id);
      }
    }

    const created = await this.prisma.counterDefinition.create({
      data: {
        id: dto.id,
        householdId,
        createdById,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        category: dto.category?.trim() ?? null,
        targetIntervalSeconds: dto.targetIntervalSeconds ?? null,
        warnRatio: dto.warnRatio ?? 0.8,
        assignmentMode: dto.assignmentMode ?? undefined,
        isActive: dto.isActive ?? true,
      },
      select: { id: true },
    });

    return this.findOne(householdId, created.id);
  }

  /**
   * Liste avec l'état dérivé. Le dernier événement de chaque compteur est
   * récupéré en une seule requête groupée plutôt qu'en une par compteur.
   */
  async findAll(householdId: string, isActive?: boolean) {
    const counters = await this.prisma.counterDefinition.findMany({
      where: {
        householdId,
        deletedAt: null,
        ...(isActive === undefined ? {} : { isActive }),
      },
      select: counterSelect,
      orderBy: { createdAt: 'asc' },
    });

    if (counters.length === 0) {
      return [];
    }

    const lastEvents = await this.lastEventsOf(counters.map((c) => c.id));

    return counters.map((counter) =>
      this.shape(counter, lastEvents.get(counter.id) ?? null),
    );
  }

  async findOne(householdId: string, counterId: string) {
    const counter = await this.require(householdId, counterId);
    const events = await this.prisma.counterEvent.findMany({
      where: { counterDefinitionId: counterId, deletedAt: null },
      select: eventSelect,
      orderBy: { occurredAt: 'desc' },
      take: 20,
    });

    return {
      ...this.shape(counter, events[0]?.occurredAt ?? null),
      events,
    };
  }

  async update(householdId: string, counterId: string, dto: UpdateCounterDto) {
    await this.require(householdId, counterId);

    await this.prisma.counterDefinition.update({
      where: { id: counterId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        category: dto.category?.trim(),
        targetIntervalSeconds: dto.targetIntervalSeconds,
        warnRatio: dto.warnRatio,
        assignmentMode: dto.assignmentMode,
        isActive: dto.isActive,
      },
    });

    return this.findOne(householdId, counterId);
  }

  /** Suppression logique : l'historique du foyer n'est pas réécrit. */
  async remove(householdId: string, counterId: string): Promise<void> {
    await this.require(householdId, counterId);
    await this.prisma.counterDefinition.update({
      where: { id: counterId },
      data: { deletedAt: this.clock.now(), isActive: false },
    });
  }

  /**
   * Remet le compteur à zéro, c'est-à-dire ajoute un événement.
   *
   * C'est un journal, pas un champ qu'on écrase : deux remises à zéro
   * concurrentes sont deux faits, et seule la plus récente détermine
   * l'état. Un conflit est donc impossible par construction.
   */
  async addEvent(
    householdId: string,
    counterId: string,
    userId: string,
    dto: CreateCounterEventDto,
  ) {
    const counter = await this.require(householdId, counterId);

    if (dto.id) {
      const existing = await this.prisma.counterEvent.findUnique({
        where: { id: dto.id },
        select: { id: true, counterDefinitionId: true },
      });
      // Rejeu : un double tap ou une file hors-ligne rejouée ne doit pas
      // créer deux événements.
      if (existing) {
        if (existing.counterDefinitionId !== counterId) {
          throw AppException.notFound();
        }
        return this.findOne(householdId, counterId);
      }
    }

    const now = this.clock.now();
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : now;

    if (occurredAt.getTime() > now.getTime()) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "L'instant d'une action ne peut pas être dans le futur.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.counterEvent.create({
        data: {
          id: dto.id,
          counterDefinitionId: counterId,
          householdId,
          occurredAt,
          recordedById: userId,
          note: dto.note?.trim() ?? null,
        },
      });

      await tx.activityLog.create({
        data: {
          householdId,
          actorId: userId,
          verb: ActivityVerb.COUNTER_RESET,
          subjectType: 'COUNTER',
          subjectId: counterId,
          summary: `a fait « ${counter.title} »`,
        },
      });
    });

    return this.findOne(householdId, counterId);
  }

  async listEvents(householdId: string, counterId: string, query: ListCounterEventsDto) {
    await this.require(householdId, counterId);
    const limit = query.limit ?? 50;

    const events = await this.prisma.counterEvent.findMany({
      where: { counterDefinitionId: counterId, deletedAt: null },
      select: eventSelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const page = events.slice(0, limit);
    return {
      data: page,
      nextCursor: events.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** Corrige une saisie erronée : l'état se recalcule tout seul. */
  async removeEvent(
    householdId: string,
    counterId: string,
    eventId: string,
  ): Promise<void> {
    await this.require(householdId, counterId);

    const event = await this.prisma.counterEvent.findFirst({
      where: {
        id: eventId,
        counterDefinitionId: counterId,
        householdId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!event) {
      throw AppException.notFound("Cet événement n'existe pas.");
    }

    await this.prisma.counterEvent.update({
      where: { id: eventId },
      data: { deletedAt: this.clock.now() },
    });
  }

  /** Dernier événement par compteur, en une requête. */
  private async lastEventsOf(counterIds: string[]): Promise<Map<string, Date>> {
    const grouped = await this.prisma.counterEvent.groupBy({
      by: ['counterDefinitionId'],
      where: { counterDefinitionId: { in: counterIds }, deletedAt: null },
      _max: { occurredAt: true },
    });

    return new Map(
      grouped
        .filter((g) => g._max.occurredAt !== null)
        .map((g) => [g.counterDefinitionId, g._max.occurredAt as Date]),
    );
  }

  private async require(householdId: string, counterId: string): Promise<CounterRow> {
    const counter = await this.prisma.counterDefinition.findFirst({
      where: { id: counterId, householdId, deletedAt: null },
      select: counterSelect,
    });

    if (!counter) {
      throw AppException.notFound("Ce compteur n'existe pas.");
    }
    return counter;
  }

  private shape(counter: CounterRow, lastEventAt: Date | null) {
    const state: CounterState = deriveCounterState({
      lastEventAt,
      targetIntervalSeconds: counter.targetIntervalSeconds,
      warnRatio: Number(counter.warnRatio),
      now: this.clock.now(),
    });

    return {
      ...counter,
      warnRatio: Number(counter.warnRatio),
      lastEventAt,
      ...state,
    };
  }
}
