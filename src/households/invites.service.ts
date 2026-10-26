import { Injectable } from '@nestjs/common';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { HouseholdsService } from './households.service';
import { generateInviteCode, normalizeInviteCode } from './invite-code';

const DEFAULT_TTL_HOURS = 168; // 7 jours

/**
 * On rejoint le foyer par un code, jamais par une recherche
 * d'utilisateur : un serveur familial n'a pas à être un annuaire.
 *
 * Le code s'utilise à la création du compte (`POST /auth/register`) et
 * non après : sur un serveur qui ne sert qu'un foyer, avoir un compte
 * *est* en faire partie. Il n'y a donc rien à « rejoindre » ensuite.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly households: HouseholdsService,
  ) {}

  async create(createdById: string, dto: CreateInviteDto) {
    const statut = await this.prisma.status.findFirst({
      where: { id: dto.statusId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!statut) {
      throw AppException.notFound("Ce statut n'existe pas.");
    }

    return this.prisma.invite.create({
      data: {
        householdId: await this.households.currentId(),
        createdById,
        code: generateInviteCode(),
        statusId: statut.id,
        maxUses: dto.maxUses ?? 1,
        expiresAt: this.clock.in((dto.ttlHours ?? DEFAULT_TTL_HOURS) * 3600),
      },
      select: {
        id: true,
        code: true,
        status: { select: { id: true, name: true } },
        maxUses: true,
        useCount: true,
        expiresAt: true,
      },
    });
  }

  async list() {
    return this.prisma.invite.findMany({
      where: { revokedAt: null, expiresAt: { gt: this.clock.now() } },
      select: {
        id: true,
        code: true,
        status: { select: { id: true, name: true } },
        maxUses: true,
        useCount: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(inviteId: string): Promise<void> {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      select: { id: true, revokedAt: true },
    });

    if (!invite) {
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
   * Consomme un code au moment de la création d'un compte, et rend le
   * statut à donner. L'incrément est conditionnel : deux personnes qui
   * utilisent en même temps un code à usage unique ne doivent pas toutes
   * les deux entrer.
   */
  async consume(rawCode: string): Promise<{ statusId: string }> {
    const code = normalizeInviteCode(rawCode);
    const now = this.clock.now();

    const invite = await this.prisma.invite.findUnique({
      where: { code },
      select: {
        id: true,
        statusId: true,
        maxUses: true,
        useCount: true,
        expiresAt: true,
        revokedAt: true,
        status: { select: { deletedAt: true } },
      },
    });

    if (!invite || invite.revokedAt !== null || invite.status.deletedAt !== null) {
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

    const consomme = await this.prisma.invite.updateMany({
      where: { id: invite.id, useCount: { lt: invite.maxUses } },
      data: { useCount: { increment: 1 } },
    });

    if (consomme.count === 0) {
      throw AppException.badRequest(
        ErrorCode.INVITE_EXHAUSTED,
        "Ce code d'invitation a déjà été utilisé.",
      );
    }

    return { statusId: invite.statusId };
  }
}
