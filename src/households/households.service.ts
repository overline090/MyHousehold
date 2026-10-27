import { Injectable } from '@nestjs/common';
import { ActivityVerb, Prisma, Right } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { DROITS_D_ADMINISTRATION } from './rights';

const SELECTION_MEMBRE = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  avatarPath: true,
  avatarColor: true,
  createdAt: true,
  status: { select: { id: true, name: true, rights: true } },
} satisfies Prisma.UserSelect;

/**
 * Le foyer. Il n'y en a qu'un par machine : aucune route ne porte son
 * identifiant, et la base le garantit par un index unique sur les lignes
 * vivantes.
 */
@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Le foyer servi par cette machine, ou null tant que l'assistant
   * d'installation ne l'a pas créé.
   */
  async currentOrNull() {
    return this.prisma.household.findFirst({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        timezone: true,
        weekStartsOn: true,
        createdAt: true,
      },
    });
  }

  async current() {
    const household = await this.currentOrNull();
    if (!household) {
      throw AppException.notFound("Ce serveur n'a pas encore de foyer.");
    }
    return household;
  }

  async currentId(): Promise<string> {
    return (await this.current()).id;
  }

  /** Vue publique : le foyer et le nombre de ses membres. */
  async describe() {
    const household = await this.current();
    const memberCount = await this.prisma.user.count({ where: { deletedAt: null } });
    return { ...household, memberCount };
  }

  /**
   * Création du foyer, par l'assistant d'installation. Idempotente : un
   * second appel renvoie le foyer existant plutôt que d'en créer un
   * autre, ce que la base refuserait de toute façon.
   */
  async createOnce(name: string, timezone?: string, weekStartsOn?: number) {
    const existant = await this.currentOrNull();
    if (existant) {
      return existant;
    }

    return this.prisma.household.create({
      data: {
        name: name.trim(),
        timezone: timezone ?? this.config.getOrThrow<string>('MH_DEFAULT_TIMEZONE'),
        weekStartsOn: weekStartsOn ?? 1,
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        weekStartsOn: true,
        createdAt: true,
      },
    });
  }

  async update(dto: UpdateHouseholdDto) {
    const household = await this.current();
    await this.prisma.household.update({
      where: { id: household.id },
      data: {
        name: dto.name?.trim(),
        timezone: dto.timezone,
        weekStartsOn: dto.weekStartsOn,
      },
    });
    return this.describe();
  }

  async members() {
    const membres = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: SELECTION_MEMBRE,
      orderBy: { createdAt: 'asc' },
    });
    return membres.map((membre) => this.vueMembre(membre));
  }

  /**
   * Changer le statut d'un membre. C'est la seule chose qu'on puisse
   * changer chez quelqu'un d'autre : il n'existe aucune route pour le
   * sortir du foyer.
   */
  async updateMember(targetUserId: string, actorId: string, dto: UpdateMemberDto) {
    const cible = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: { id: true, firstName: true, status: { select: { id: true, name: true } } },
    });

    if (!cible) {
      throw AppException.notFound('Ce membre ne fait pas partie du foyer.');
    }

    const statut = await this.prisma.status.findFirst({
      where: { id: dto.statusId, deletedAt: null },
      select: { id: true, name: true, rights: true },
    });

    if (!statut) {
      throw AppException.notFound("Ce statut n'existe pas.");
    }

    if (statut.id !== cible.status.id) {
      await this.assertResteUnAdministrateur(targetUserId, statut.rights);
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { statusId: statut.id },
    });

    if (statut.id !== cible.status.id) {
      await this.logActivity(
        await this.currentId(),
        actorId,
        ActivityVerb.MEMBER_STATUS_CHANGED,
        `a donné le statut « ${statut.name} » à ${cible.firstName}`,
        { type: 'user', id: targetUserId },
      );
    }

    return this.members();
  }

  /**
   * Après ce changement, chaque droit d'administration doit rester porté
   * par au moins un compte actif. Sans cela plus personne ne peut
   * administrer le foyer, et il est définitivement bloqué.
   *
   * `futursDroits` sont les droits que `userId` aura après l'opération ;
   * `null` quand le compte disparaît.
   */
  async assertResteUnAdministrateur(
    userId: string,
    futursDroits: readonly Right[] | null,
  ): Promise<void> {
    for (const droit of DROITS_D_ADMINISTRATION) {
      if (futursDroits?.includes(droit)) {
        continue;
      }

      const autres = await this.prisma.user.count({
        where: {
          deletedAt: null,
          id: { not: userId },
          status: { rights: { has: droit } },
        },
      });

      if (autres === 0) {
        throw AppException.conflict(
          ErrorCode.LAST_ADMIN,
          'Le foyer doit garder au moins un compte qui l’administre. Donnez ce droit à quelqu’un d’autre d’abord.',
          { right: droit },
        );
      }
    }
  }

  vueMembre(membre: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    avatarPath: string | null;
    avatarColor: string;
    createdAt: Date;
    status: { id: string; name: string; rights: Right[] };
  }) {
    return {
      id: membre.id,
      username: membre.username,
      firstName: membre.firstName,
      lastName: membre.lastName,
      birthDate: membre.birthDate,
      // Le chemin du fichier ne sort jamais : l'app reçoit une URL, le
      // stockage reste un détail du serveur.
      avatarUrl: membre.avatarPath ? `/api/v1/users/${membre.id}/avatar` : null,
      avatarColor: membre.avatarColor,
      status: { id: membre.status.id, name: membre.status.name },
      rights: membre.status.rights,
      joinedAt: membre.createdAt,
    };
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

  /** Horloge partagée, pour les services qui n'en injectent pas une. */
  get now(): Date {
    return this.clock.now();
  }
}
