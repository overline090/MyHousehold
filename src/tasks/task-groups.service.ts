import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTaskGroupDto, UpdateTaskGroupDto } from './dto/task-group.dto';

const groupSelect = {
  id: true,
  name: true,
  color: true,
  position: true,
  createdAt: true,
  _count: { select: { tasks: { where: { deletedAt: null, isActive: true } } } },
} satisfies Prisma.TaskGroupSelect;

/**
 * Un groupe rassemble des tâches qui vont ensemble. Une tâche appartient
 * à un groupe au plus — les appartenances multiples transforment une
 * liste de corvées en système de classement, et personne ne range ses
 * corvées.
 */
@Injectable()
export class TaskGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async findAll(householdId: string) {
    const groupes = await this.prisma.taskGroup.findMany({
      where: { householdId, deletedAt: null },
      select: groupSelect,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return groupes.map(({ _count, ...groupe }) => ({
      ...groupe,
      taskCount: _count.tasks,
    }));
  }

  async create(householdId: string, dto: CreateTaskGroupDto) {
    if (dto.id) {
      const existant = await this.prisma.taskGroup.findUnique({
        where: { id: dto.id },
        select: { id: true, householdId: true },
      });
      // Création idempotente, comme pour les tâches : un envoi rejoué
      // après une coupure réseau ne crée pas un second groupe.
      if (existant) {
        if (existant.householdId !== householdId) {
          throw AppException.notFound();
        }
        return this.findOne(householdId, existant.id);
      }
    }

    const groupe = await this.prisma.taskGroup.create({
      data: {
        id: dto.id,
        householdId,
        name: dto.name.trim(),
        color: dto.color ?? '#0F766E',
        position: dto.position ?? 0,
      },
      select: groupSelect,
    });

    const { _count, ...reste } = groupe;
    return { ...reste, taskCount: _count.tasks };
  }

  async update(householdId: string, groupId: string, dto: UpdateTaskGroupDto) {
    await this.require(householdId, groupId);

    const groupe = await this.prisma.taskGroup.update({
      where: { id: groupId },
      data: { name: dto.name?.trim(), color: dto.color, position: dto.position },
      select: groupSelect,
    });

    const { _count, ...reste } = groupe;
    return { ...reste, taskCount: _count.tasks };
  }

  /**
   * Supprimer un groupe **détache** ses tâches au lieu de les supprimer :
   * perdre une corvée parce qu'on a rangé une étiquette serait une
   * mauvaise surprise.
   */
  async remove(householdId: string, groupId: string): Promise<void> {
    await this.require(householdId, groupId);

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { groupId },
        data: { groupId: null },
      }),
      this.prisma.taskGroup.update({
        where: { id: groupId },
        data: { deletedAt: this.clock.now() },
      }),
    ]);
  }

  private async findOne(householdId: string, groupId: string) {
    const groupe = await this.require(householdId, groupId);
    const { _count, ...reste } = groupe;
    return { ...reste, taskCount: _count.tasks };
  }

  private async require(householdId: string, groupId: string) {
    const groupe = await this.prisma.taskGroup.findFirst({
      where: { id: groupId, householdId, deletedAt: null },
      select: groupSelect,
    });

    if (!groupe) {
      throw AppException.notFound("Ce groupe de tâches n'existe pas.");
    }

    return groupe;
  }
}
