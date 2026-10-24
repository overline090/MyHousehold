import { Injectable } from '@nestjs/common';
import { ActivityVerb, HouseholdRole, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembershipCacheService } from './membership-cache.service';

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
    private readonly memberships: MembershipCacheService,
  ) {}

  async create(userId: string, dto: CreateHouseholdDto) {
    const existing = dto.id
      ? await this.prisma.household.findUnique({ where: { id: dto.id } })
      : null;

    // Création idempotente : le client peut rejouer l'appel après une
    // coupure réseau sans créer un second foyer.
    if (existing) {
      return this.findOne(existing.id);
    }

    const household = await this.prisma.household.create({
      data: {
        id: dto.id,
        name: dto.name.trim(),
        timezone: dto.timezone ?? this.config.getOrThrow<string>('MH_DEFAULT_TIMEZONE'),
        weekStartsOn: dto.weekStartsOn ?? 1,
        members: {
          create: { userId, role: HouseholdRole.OWNER },
        },
      },
      select: { id: true },
    });

    await this.logActivity(
      household.id,
      userId,
      ActivityVerb.MEMBER_JOINED,
      'a créé le foyer',
    );

    return this.findOne(household.id);
  }

  async findOne(householdId: string) {
    const household = await this.prisma.household.findFirst({
      where: { id: householdId, deletedAt: null },
      select: {
        id: true,
        name: true,
        timezone: true,
        weekStartsOn: true,
        createdAt: true,
        _count: { select: { members: { where: { deletedAt: null } } } },
      },
    });

    if (!household) {
      throw AppException.notFound();
    }

    const { _count, ...rest } = household;
    return { ...rest, memberCount: _count.members };
  }

  async update(householdId: string, dto: UpdateHouseholdDto) {
    await this.prisma.household.update({
      where: { id: householdId },
      data: {
        name: dto.name?.trim(),
        timezone: dto.timezone,
        weekStartsOn: dto.weekStartsOn,
      },
    });
    return this.findOne(householdId);
  }

  /**
   * Suppression logique : les clients hors-ligne doivent pouvoir
   * apprendre la disparition du foyer lors de leur prochaine synchro.
   */
  async remove(householdId: string): Promise<void> {
    const now = this.clock.now();
    this.memberships.invalidateHousehold(householdId);
    await this.prisma.$transaction([
      this.prisma.household.update({
        where: { id: householdId },
        data: { deletedAt: now },
      }),
      this.prisma.householdMember.updateMany({
        where: { householdId, deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);
  }

  async members(householdId: string) {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId, deletedAt: null },
      select: {
        role: true,
        nickname: true,
        joinedAt: true,
        user: {
          select: { id: true, displayName: true, email: true, avatarColor: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((m) => ({
      userId: m.user.id,
      displayName: m.nickname ?? m.user.displayName,
      email: m.user.email,
      avatarColor: m.user.avatarColor,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  async updateMember(
    householdId: string,
    targetUserId: string,
    actorId: string,
    dto: UpdateMemberDto,
  ) {
    const target = await this.requireMember(householdId, targetUserId);

    // Un foyer garde toujours au moins un propriétaire : sans cela,
    // plus personne ne peut inviter ni gérer les rôles, et le foyer est
    // définitivement bloqué.
    if (
      target.role === HouseholdRole.OWNER &&
      dto.role !== undefined &&
      dto.role !== HouseholdRole.OWNER
    ) {
      await this.assertNotLastOwner(householdId, targetUserId);
    }

    await this.prisma.householdMember.update({
      where: { householdId_userId: { householdId, userId: targetUserId } },
      data: { role: dto.role, nickname: dto.nickname },
    });

    this.memberships.invalidate(targetUserId, householdId);

    if (dto.role && dto.role !== target.role) {
      await this.logActivity(
        householdId,
        actorId,
        ActivityVerb.MEMBER_ROLE_CHANGED,
        `a changé un rôle en ${dto.role}`,
      );
    }

    return this.members(householdId);
  }

  async removeMember(
    householdId: string,
    targetUserId: string,
    actorId: string,
  ): Promise<void> {
    const target = await this.requireMember(householdId, targetUserId);

    if (target.role === HouseholdRole.OWNER) {
      await this.assertNotLastOwner(householdId, targetUserId);
    }

    await this.prisma.householdMember.update({
      where: { householdId_userId: { householdId, userId: targetUserId } },
      data: { deletedAt: this.clock.now() },
    });

    this.memberships.invalidate(targetUserId, householdId);

    await this.logActivity(
      householdId,
      actorId,
      ActivityVerb.MEMBER_LEFT,
      targetUserId === actorId ? 'a quitté le foyer' : 'a exclu un membre',
    );
  }

  private async requireMember(householdId: string, userId: string) {
    const member = await this.prisma.householdMember.findFirst({
      where: { householdId, userId, deletedAt: null },
      select: { role: true },
    });
    if (!member) {
      throw AppException.notFound('Ce membre ne fait pas partie du foyer.');
    }
    return member;
  }

  private async assertNotLastOwner(householdId: string, userId: string): Promise<void> {
    const otherOwners = await this.prisma.householdMember.count({
      where: {
        householdId,
        role: HouseholdRole.OWNER,
        deletedAt: null,
        userId: { not: userId },
      },
    });

    if (otherOwners === 0) {
      throw AppException.conflict(
        ErrorCode.LAST_OWNER,
        'Un foyer doit garder au moins un propriétaire. Transmettez le rôle avant de partir.',
      );
    }
  }

  async logActivity(
    householdId: string,
    actorId: string | null,
    verb: ActivityVerb,
    summary: string,
    subject?: { type: string; id: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).activityLog.create({
      data: {
        householdId,
        actorId,
        verb,
        summary,
        subjectType: subject?.type,
        subjectId: subject?.id,
      },
    });
  }
}
