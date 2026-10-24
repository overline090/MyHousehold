import { Injectable, Logger } from '@nestjs/common';
import { ActivityVerb, HouseholdRole, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PasswordService } from '../auth/password.service';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { MembershipCacheService } from '../households/membership-cache.service';
import { pickOwnershipSuccessor } from './ownership-successor';

/** Nom affiché à la place de celui d'un compte supprimé. */
export const DELETED_DISPLAY_NAME = 'Ancien membre';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly clock: ClockService,
    private readonly memberships: MembershipCacheService,
  ) {}

  /**
   * Supprime un compte : le sien, ou celui d'un autre si l'appelant est
   * administrateur de l'instance.
   *
   * Le compte n'est pas effacé mais **anonymisé** : la ligne reste, vidée
   * de toute donnée personnelle. C'est ce qui permet à l'historique du
   * foyer de rester cohérent (« Ancien membre a sorti les poubelles »)
   * sans conserver l'identité de quelqu'un qui a demandé son effacement.
   * Tout effacer rendrait les statistiques du foyer fausses
   * rétroactivement.
   *
   * La suppression ne peut pas échouer pour une raison d'organisation :
   * si le compte est le dernier propriétaire d'un foyer, la propriété est
   * transmise, et à défaut de successeur le foyer est supprimé.
   */
  async deleteAccount(
    targetUserId: string,
    actor: AuthenticatedUser,
    password: string,
  ): Promise<void> {
    const actingOnSelf = targetUserId === actor.id;

    // Un non-administrateur qui vise un autre compte reçoit 404 et non
    // 403 : inutile de lui confirmer que ce compte existe.
    if (!actingOnSelf && !actor.isServerAdmin) {
      throw AppException.notFound();
    }

    // Le mot de passe demandé est toujours celui de l'appelant. Une
    // suppression est irréversible : une session volée ne doit pas
    // suffire à la déclencher.
    const acting = await this.prisma.user.findFirstOrThrow({
      where: { id: actor.id, deletedAt: null },
      select: { passwordHash: true },
    });

    if (!(await this.passwords.verify(acting.passwordHash, password))) {
      throw AppException.unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Mot de passe incorrect.',
      );
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: { id: true, isServerAdmin: true },
    });

    if (!target) {
      throw AppException.notFound();
    }

    const invalidations: { userId: string; householdId: string }[] = [];
    const deletedHouseholds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const memberships = await tx.householdMember.findMany({
        where: {
          userId: target.id,
          deletedAt: null,
          household: { deletedAt: null },
        },
        select: { householdId: true, role: true },
      });

      for (const membership of memberships) {
        if (membership.role === HouseholdRole.OWNER) {
          const transferred = await this.transferOwnership(
            tx,
            membership.householdId,
            target.id,
          );
          if (transferred === null) {
            await this.deleteEmptyHousehold(tx, membership.householdId, target.id);
            deletedHouseholds.push(membership.householdId);
            continue;
          }
          if (transferred !== undefined) {
            invalidations.push({
              userId: transferred,
              householdId: membership.householdId,
            });
          }
        }

        await tx.householdMember.update({
          where: {
            householdId_userId: {
              householdId: membership.householdId,
              userId: target.id,
            },
          },
          data: { deletedAt: this.clock.now() },
        });

        await tx.activityLog.create({
          data: {
            householdId: membership.householdId,
            actorId: target.id,
            verb: ActivityVerb.MEMBER_ACCOUNT_DELETED,
            summary: 'a supprimé son compte',
          },
        });

        invalidations.push({
          userId: target.id,
          householdId: membership.householdId,
        });
      }

      // Les invitations qu'il avait émises n'ont plus d'émetteur joignable.
      await tx.invite.updateMany({
        where: { createdById: target.id, revokedAt: null },
        data: { revokedAt: this.clock.now() },
      });

      // Supprimés et non anonymisés : ces lignes ne portent aucun
      // historique utile au foyer, mais des jetons et des identifiants
      // d'agenda qui n'ont plus aucune raison d'exister.
      await tx.refreshToken.deleteMany({ where: { userId: target.id } });
      await tx.device.deleteMany({ where: { userId: target.id } });
      await tx.calendarAccount.deleteMany({ where: { userId: target.id } });
      await tx.notificationPreference.deleteMany({ where: { userId: target.id } });
      await tx.reminder.deleteMany({ where: { userId: target.id } });

      await tx.user.update({
        where: { id: target.id },
        data: {
          // L'adresse doit rester unique tout en devenant inutilisable
          // pour se connecter ou être reconnue.
          email: `supprime+${target.id}@invalide.local`,
          displayName: DELETED_DISPLAY_NAME,
          // Valeur aléatoire, et non vide : elle n'est pas une empreinte
          // Argon2 valide, donc aucune vérification ne peut réussir.
          passwordHash: randomBytes(32).toString('base64'),
          timezone: null,
          isServerAdmin: false,
          deletedAt: this.clock.now(),
        },
      });

      if (target.isServerAdmin) {
        await this.ensureServerAdminRemains(tx, target.id);
      }
    });

    for (const { userId, householdId } of invalidations) {
      this.memberships.invalidate(userId, householdId);
    }
    for (const householdId of deletedHouseholds) {
      this.memberships.invalidateHousehold(householdId);
    }

    this.logger.log(
      actingOnSelf
        ? `Compte ${target.id} supprimé par son titulaire`
        : `Compte ${target.id} supprimé par l'administrateur ${actor.id}`,
    );
  }

  /**
   * Transmet la propriété du foyer si le compte supprimé en était le
   * dernier propriétaire. Rend l'identifiant du successeur, `undefined`
   * s'il restait un autre propriétaire (rien à faire), ou `null` s'il n'y
   * a personne à qui transmettre.
   */
  private async transferOwnership(
    tx: Prisma.TransactionClient,
    householdId: string,
    leavingUserId: string,
  ): Promise<string | undefined | null> {
    const others = await tx.householdMember.findMany({
      where: {
        householdId,
        deletedAt: null,
        userId: { not: leavingUserId },
      },
      select: { userId: true, role: true, joinedAt: true },
    });

    if (others.some((m) => m.role === HouseholdRole.OWNER)) {
      return undefined;
    }

    const successor = pickOwnershipSuccessor(others);
    if (!successor) {
      return null;
    }

    await tx.householdMember.update({
      where: { householdId_userId: { householdId, userId: successor.userId } },
      data: { role: HouseholdRole.OWNER },
    });

    await tx.activityLog.create({
      data: {
        householdId,
        actorId: successor.userId,
        verb: ActivityVerb.OWNERSHIP_TRANSFERRED,
        summary: 'est devenu propriétaire du foyer',
      },
    });

    return successor.userId;
  }

  /** Foyer sans successeur possible : il ne reste personne pour le gérer. */
  private async deleteEmptyHousehold(
    tx: Prisma.TransactionClient,
    householdId: string,
    actorId: string,
  ): Promise<void> {
    const now = this.clock.now();
    await tx.household.update({
      where: { id: householdId },
      data: { deletedAt: now },
    });
    await tx.householdMember.updateMany({
      where: { householdId, deletedAt: null },
      data: { deletedAt: now },
    });
    this.logger.log(
      `Foyer ${householdId} supprimé : aucun successeur après la suppression du compte ${actorId}`,
    );
  }

  /**
   * Une instance sans administrateur n'est plus administrable : le compte
   * actif le plus ancien prend le relais.
   */
  private async ensureServerAdminRemains(
    tx: Prisma.TransactionClient,
    excludedUserId: string,
  ): Promise<void> {
    const remainingAdmins = await tx.user.count({
      where: { isServerAdmin: true, deletedAt: null, id: { not: excludedUserId } },
    });

    if (remainingAdmins > 0) {
      return;
    }

    const successor = await tx.user.findFirst({
      where: { deletedAt: null, id: { not: excludedUserId } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!successor) {
      return;
    }

    await tx.user.update({
      where: { id: successor.id },
      data: { isServerAdmin: true },
    });

    this.logger.warn(
      `Le compte ${successor.id} devient administrateur de l'instance : le dernier administrateur a supprimé son compte`,
    );
  }

  /** Liste des comptes de l'instance, réservée aux administrateurs. */
  async listAccounts(includeDeleted: boolean) {
    const users = await this.prisma.user.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        isServerAdmin: true,
        createdAt: true,
        deletedAt: true,
        _count: { select: { memberships: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map(({ _count, ...user }) => ({
      ...user,
      householdCount: _count.memberships,
    }));
  }
}
