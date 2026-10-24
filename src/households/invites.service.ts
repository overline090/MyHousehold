import { Injectable } from '@nestjs/common';
import { ActivityVerb, HouseholdRole } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { HouseholdsService } from './households.service';
import { generateInviteCode, normalizeInviteCode } from './invite-code';

const DEFAULT_TTL_HOURS = 168; // 7 jours

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly households: HouseholdsService,
  ) {}

  async create(householdId: string, createdById: string, dto: CreateInviteDto) {
    const invite = await this.prisma.invite.create({
      data: {
        householdId,
        createdById,
        code: generateInviteCode(),
        role: dto.role ?? HouseholdRole.ADULT,
        maxUses: dto.maxUses ?? 1,
        expiresAt: this.clock.in((dto.ttlHours ?? DEFAULT_TTL_HOURS) * 3600),
      },
      select: {
        id: true,
        code: true,
        role: true,
        maxUses: true,
        useCount: true,
        expiresAt: true,
      },
    });
    return invite;
  }

  async list(householdId: string) {
    return this.prisma.invite.findMany({
      where: { householdId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      select: {
        id: true,
        code: true,
        role: true,
        maxUses: true,
        useCount: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(inviteId: string, userId: string): Promise<void> {
    // La route n'est pas sous /households/:householdId, donc la garde
    // d'appartenance ne s'applique pas : on vérifie ici que l'appelant
    // est bien propriétaire du foyer visé.
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      select: { id: true, householdId: true, revokedAt: true },
    });

    if (!invite) {
      throw AppException.notFound();
    }

    const membership = await this.prisma.householdMember.findFirst({
      where: {
        householdId: invite.householdId,
        userId,
        role: HouseholdRole.OWNER,
        deletedAt: null,
      },
      select: { userId: true },
    });

    if (!membership) {
      throw AppException.notFound();
    }

    if (invite.revokedAt === null) {
      await this.prisma.invite.update({
        where: { id: inviteId },
        data: { revokedAt: this.clock.now() },
      });
    }
  }

  /**
   * Accepter une invitation. Les vérifications et l'incrément du compteur
   * d'usage se font dans une transaction : deux personnes qui utilisent
   * en même temps un code à usage unique ne doivent pas tous les deux
   * rejoindre le foyer.
   */
  async accept(rawCode: string, userId: string) {
    const code = normalizeInviteCode(rawCode);
    const now = this.clock.now();

    const householdId = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({
        where: { code },
        select: {
          id: true,
          householdId: true,
          role: true,
          maxUses: true,
          useCount: true,
          expiresAt: true,
          revokedAt: true,
          household: { select: { deletedAt: true } },
        },
      });

      if (!invite || invite.revokedAt !== null || invite.household.deletedAt !== null) {
        throw AppException.badRequest(
          ErrorCode.INVITE_INVALID,
          "Ce code d'invitation n'est pas valide.",
        );
      }

      if (invite.expiresAt <= now) {
        throw AppException.badRequest(
          ErrorCode.INVITE_EXPIRED,
          "Ce code d'invitation a expiré. Demandez-en un nouveau.",
        );
      }

      if (invite.useCount >= invite.maxUses) {
        throw AppException.badRequest(
          ErrorCode.INVITE_EXHAUSTED,
          "Ce code d'invitation a déjà été utilisé.",
        );
      }

      const existing = await tx.householdMember.findUnique({
        where: {
          householdId_userId: { householdId: invite.householdId, userId },
        },
        select: { deletedAt: true },
      });

      if (existing && existing.deletedAt === null) {
        throw AppException.conflict(
          ErrorCode.ALREADY_MEMBER,
          'Vous faites déjà partie de ce foyer.',
        );
      }

      if (existing) {
        // Membre précédemment exclu ou parti : on réactive la ligne
        // plutôt que d'en créer une seconde.
        await tx.householdMember.update({
          where: {
            householdId_userId: { householdId: invite.householdId, userId },
          },
          data: { deletedAt: null, role: invite.role, joinedAt: now },
        });
      } else {
        await tx.householdMember.create({
          data: { householdId: invite.householdId, userId, role: invite.role },
        });
      }

      // Incrément conditionnel : si une autre transaction a consommé le
      // dernier usage entre-temps, aucune ligne n'est touchée et on
      // refuse l'adhésion.
      const consumed = await tx.invite.updateMany({
        where: { id: invite.id, useCount: { lt: invite.maxUses } },
        data: { useCount: { increment: 1 } },
      });

      if (consumed.count === 0) {
        throw AppException.badRequest(
          ErrorCode.INVITE_EXHAUSTED,
          "Ce code d'invitation a déjà été utilisé.",
        );
      }

      await this.households.logActivity(
        invite.householdId,
        userId,
        ActivityVerb.MEMBER_JOINED,
        'a rejoint le foyer',
        undefined,
        tx,
      );

      return invite.householdId;
    });

    return this.households.findOne(householdId);
  }
}
