import { Injectable, Logger } from '@nestjs/common';
import { ActivityVerb, Prisma, Right } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PasswordService } from '../auth/password.service';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { PreferencesDto } from './dto/preferences.dto';
import { HouseholdsService } from '../households/households.service';
import { StatusesService } from '../households/statuses.service';
import { DROITS_D_ADMINISTRATION } from '../households/rights';
import { pickAdminSuccessor } from './admin-successor';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Nom affiché à la place de celui d'un compte supprimé. */
export const DELETED_FIRST_NAME = 'Ancien';
export const DELETED_LAST_NAME = 'membre';

const SELECTION_PROFIL = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  avatarPath: true,
  avatarColor: true,
  locale: true,
  timezone: true,
  createdAt: true,
  status: { select: { id: true, name: true, rights: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly clock: ClockService,
    private readonly households: HouseholdsService,
    private readonly statuses: StatusesService,
  ) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: SELECTION_PROFIL,
    });
    return this.vue(user);
  }

  /**
   * Chacun modifie son nom, son prénom, sa date de naissance. **Personne
   * ne modifie son propre statut** : il n'y a pas de champ pour cela
   * ici, pas même pour un administrateur. Un statut se change depuis
   * `PATCH /members/:id`, par quelqu'un qui en a le droit.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        birthDate:
          dto.birthDate === undefined
            ? undefined
            : dto.birthDate === null
              ? null
              : new Date(dto.birthDate),
        locale: dto.locale,
        timezone: dto.timezone,
        avatarColor: dto.avatarColor,
      },
    });
    return this.profile(userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: { passwordHash: true },
    });

    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw AppException.unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Mot de passe incorrect.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });

    // Changer de mot de passe ferme les autres sessions : c'est le geste
    // qu'on fait justement quand on craint qu'une session traîne ailleurs.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async setAvatarPath(userId: string, avatarPath: string | null) {
    await this.prisma.user.update({ where: { id: userId }, data: { avatarPath } });
    return this.profile(userId);
  }

  async avatarPathOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { avatarPath: true },
    });
    return user?.avatarPath ?? null;
  }

  /**
   * Supprime un compte : le sien, ou celui d'un autre quand l'appelant
   * porte `MANAGE_SERVER` — c'est le seul moyen de retirer un compte
   * dont le titulaire n'est plus joignable.
   *
   * Le compte n'est pas effacé mais **anonymisé** : la ligne reste, vidée
   * de toute donnée personnelle. C'est ce qui permet à l'historique du
   * foyer de rester cohérent (« Ancien membre a sorti les poubelles »)
   * sans conserver l'identité de quelqu'un qui a demandé son effacement.
   *
   * La suppression ne peut pas échouer pour une raison d'organisation :
   * si le compte était le dernier à administrer le foyer, l'administration
   * passe au compte actif le plus ancien.
   */
  async deleteAccount(
    targetUserId: string,
    actor: AuthenticatedUser,
    password: string,
  ): Promise<void> {
    const actingOnSelf = targetUserId === actor.id;

    // Un compte sans MANAGE_SERVER qui vise quelqu'un d'autre reçoit 404
    // et non 403 : inutile de lui confirmer que ce compte existe.
    if (!actingOnSelf && !actor.rights.includes(Right.MANAGE_SERVER)) {
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
      select: { id: true, status: { select: { rights: true } } },
    });

    if (!target) {
      throw AppException.notFound();
    }

    const household = await this.households.currentOrNull();
    const administrait = DROITS_D_ADMINISTRATION.some((droit) =>
      target.status.rights.includes(droit),
    );
    const statutAdministrateur = administrait
      ? await this.statuses.administratorStatusId()
      : null;

    await this.prisma.$transaction(async (tx) => {
      if (household) {
        await tx.activityLog.create({
          data: {
            householdId: household.id,
            actorId: target.id,
            verb: ActivityVerb.MEMBER_ACCOUNT_DELETED,
            summary: 'a supprimé son compte',
          },
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
          // L'identifiant doit rester unique tout en devenant
          // inutilisable : la majuscule et le « : » sont hors du motif
          // qu'accepte la connexion, personne ne peut le saisir.
          username: `Supprimé:${target.id}`,
          firstName: DELETED_FIRST_NAME,
          lastName: DELETED_LAST_NAME,
          birthDate: null,
          avatarPath: null,
          // Valeur aléatoire, et non vide : elle n'est pas une empreinte
          // Argon2 valide, donc aucune vérification ne peut réussir.
          passwordHash: randomBytes(32).toString('base64'),
          timezone: null,
          deletedAt: this.clock.now(),
        },
      });

      if (statutAdministrateur) {
        await this.transmettreAdministration(
          tx,
          target.id,
          statutAdministrateur,
          household?.id,
        );
      }
    });

    this.logger.log(
      actingOnSelf
        ? `Compte ${target.id} supprimé par son titulaire`
        : `Compte ${target.id} supprimé par l'administrateur ${actor.id}`,
    );
  }

  /**
   * Un foyer sans compte qui l'administre n'est plus administrable. Si
   * le compte supprimé était le dernier à porter un droit
   * d'administration, le compte actif le plus ancien reçoit le statut
   * d'administrateur.
   */
  private async transmettreAdministration(
    tx: Prisma.TransactionClient,
    excluUserId: string,
    statutAdministrateurId: string,
    householdId: string | undefined,
  ): Promise<void> {
    const manquants: Right[] = [];

    for (const droit of DROITS_D_ADMINISTRATION) {
      const restants = await tx.user.count({
        where: {
          deletedAt: null,
          id: { not: excluUserId },
          status: { rights: { has: droit } },
        },
      });
      if (restants === 0) {
        manquants.push(droit);
      }
    }

    if (manquants.length === 0) {
      return;
    }

    const candidats = await tx.user.findMany({
      where: { deletedAt: null, id: { not: excluUserId } },
      select: { id: true, createdAt: true },
    });

    const successeur = pickAdminSuccessor(
      candidats.map((candidat) => ({
        userId: candidat.id,
        createdAt: candidat.createdAt,
      })),
    );

    if (!successeur) {
      // Il ne reste personne : le foyer part avec son dernier compte.
      if (householdId) {
        await tx.household.update({
          where: { id: householdId },
          data: { deletedAt: this.clock.now() },
        });
        this.logger.log(
          `Foyer ${householdId} supprimé : son dernier compte vient de l'être`,
        );
      }
      return;
    }

    await tx.user.update({
      where: { id: successeur.userId },
      data: { statusId: statutAdministrateurId },
    });

    if (householdId) {
      await tx.activityLog.create({
        data: {
          householdId,
          actorId: successeur.userId,
          verb: ActivityVerb.ADMIN_RIGHTS_TRANSFERRED,
          summary: 'administre désormais le foyer',
        },
      });
    }

    this.logger.warn(
      `Le compte ${successeur.userId} administre désormais le foyer : le dernier administrateur a supprimé son compte`,
    );
  }

  /** Liste des comptes du serveur, réservée à `MANAGE_SERVER`. */
  async listAccounts(includeDeleted: boolean) {
    const users = await this.prisma.user.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        deletedAt: true,
        status: { select: { id: true, name: true, rights: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      status: { id: user.status.id, name: user.status.name },
      rights: user.status.rights,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
    }));
  }

  private vue(user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    avatarPath: string | null;
    avatarColor: string;
    locale: string;
    timezone: string | null;
    createdAt: Date;
    status: { id: string; name: string; rights: Right[] };
  }) {
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate,
      avatarUrl: user.avatarPath ? `/api/v1/users/${user.id}/avatar` : null,
      avatarColor: user.avatarColor,
      locale: user.locale,
      timezone: user.timezone,
      status: { id: user.status.id, name: user.status.name },
      rights: user.status.rights,
      joinedAt: user.createdAt,
    };
  }

  async preferences(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    return (user.preferences as Record<string, unknown> | null) ?? {};
  }

  /** Ce qui est envoyé remplace, ce qui manque est gardé. */
  async changerPreferences(
    userId: string,
    dto: PreferencesDto,
  ): Promise<Record<string, unknown>> {
    const actuelles = await this.preferences(userId);
    const envoyees = Object.fromEntries(
      Object.entries(dto).filter(([, valeur]) => valeur !== undefined),
    );
    const fusion = { ...actuelles, ...envoyees };
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: fusion },
    });
    return fusion;
  }
}
