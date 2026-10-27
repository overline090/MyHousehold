import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Right } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { HouseholdsService } from '../households/households.service';
import { InvitesService } from '../households/invites.service';
import { StatusesService } from '../households/statuses.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenPair, TokensService } from './tokens.service';

export interface HouseholdSummary {
  id: string;
  name: string;
  timezone: string;
}

export interface UserSummary {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  avatarUrl: string | null;
  status: { id: string; name: string };
  rights: Right[];
}

export interface SessionResponse extends TokenPair {
  user: UserSummary;
  /// Le foyer servi par cette machine. Il n'y en a qu'un : le client n'a
  /// rien à choisir, et aucune route ne porte son identifiant.
  household: HouseholdSummary | null;
}

const SELECTION_COMPTE = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  avatarPath: true,
  status: { select: { id: true, name: true, rights: true } },
} satisfies Prisma.UserSelect;

type CompteSelectionne = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  avatarPath: string | null;
  status: { id: string; name: string; rights: Right[] };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
    private readonly households: HouseholdsService,
    private readonly invites: InvitesService,
    private readonly statuses: StatusesService,
  ) {}

  /**
   * Créer un compte. Deux chemins, et un seul à la fois :
   *
   * - **inscriptions libres**, c'est-à-dire pendant l'installation, tant
   *   que `MH_ALLOW_REGISTRATION` le permet : le compte est créé sans
   *   code, et le premier d'un serveur neuf devient administrateur ;
   * - **code d'invitation**, ensuite : avoir un compte sur ce serveur,
   *   c'est faire partie de son foyer, donc le code s'utilise ici et non
   *   après coup. Il n'y a rien à « rejoindre » une fois inscrit.
   */
  async register(dto: RegisterDto): Promise<SessionResponse> {
    const setup = await this.prisma.serverSetup.findUnique({
      where: { id: 1 },
      select: { completedAt: true },
    });
    const libre =
      this.config.getOrThrow<boolean>('MH_ALLOW_REGISTRATION') &&
      setup?.completedAt == null;

    if (!libre && !dto.inviteCode) {
      throw AppException.forbidden(
        ErrorCode.REGISTRATION_CLOSED,
        "Les inscriptions sont fermées sur ce serveur. Demandez un code d'invitation à son administrateur.",
      );
    }

    const passwordHash = await this.passwords.hash(dto.password);

    // Le code est consommé avant la création : un compte créé puis
    // refusé laisserait un identifiant pris pour rien.
    const premierCompte = (await this.prisma.user.count()) === 0;
    const statusId = dto.inviteCode
      ? (await this.invites.consume(dto.inviteCode)).statusId
      : premierCompte
        ? await this.statuses.administratorStatusId()
        : await this.statuses.defaultStatusId();

    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          passwordHash,
          timezone: dto.timezone ?? null,
          statusId,
        },
        select: SELECTION_COMPTE,
      });

      return this.buildSession(user, await this.tokens.issue(user.id));
    } catch (error) {
      // On s'appuie sur la contrainte d'unicité plutôt que sur un
      // « SELECT puis INSERT » : deux inscriptions simultanées avec le
      // même identifiant passeraient entre les deux.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw AppException.conflict(
          ErrorCode.USERNAME_ALREADY_USED,
          'Cet identifiant est déjà pris. Choisissez-en un autre.',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<SessionResponse> {
    const username = dto.username;
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
    });

    // Un mot de passe est vérifié même quand le compte n'existe pas :
    // sinon le temps de réponse révèle quelles adresses sont inscrites.
    const hash = user?.passwordHash ?? (await this.passwords.decoyHash());
    const valid = await this.passwords.verify(hash, dto.password);

    if (!user || !valid) {
      throw AppException.unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Adresse ou mot de passe incorrect.',
      );
    }

    const deviceId = dto.deviceId
      ? await this.upsertDevice(user.id, dto.deviceId, dto.deviceName)
      : null;

    return this.buildSession(
      await this.prisma.user.findFirstOrThrow({
        where: { id: user.id },
        select: SELECTION_COMPTE,
      }),
      await this.tokens.issue(user.id, deviceId),
    );
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<Omit<SessionResponse, keyof TokenPair>> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: SELECTION_COMPTE,
    });
    return {
      user: this.vueCompte(user),
      household: await this.households.currentOrNull(),
    };
  }

  private async upsertDevice(
    userId: string,
    deviceId: string,
    deviceName?: string,
  ): Promise<string> {
    const device = await this.prisma.device.upsert({
      where: { id: deviceId },
      create: {
        id: deviceId,
        userId,
        platform: deviceName ?? null,
        lastSeenAt: this.clock.now(),
      },
      update: { lastSeenAt: this.clock.now() },
      select: { id: true, userId: true },
    });

    // Un identifiant d'appareil déjà pris par quelqu'un d'autre ne doit
    // pas rattacher la session au mauvais compte.
    if (device.userId !== userId) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Cet identifiant d'appareil est déjà utilisé.",
      );
    }
    return device.id;
  }

  private vueCompte(user: CompteSelectionne): UserSummary {
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate,
      avatarUrl: user.avatarPath ? `/api/v1/users/${user.id}/avatar` : null,
      status: { id: user.status.id, name: user.status.name },
      rights: user.status.rights,
    };
  }

  private async buildSession(
    user: CompteSelectionne,
    tokens: TokenPair,
  ): Promise<SessionResponse> {
    return {
      ...tokens,
      user: this.vueCompte(user),
      household: await this.households.currentOrNull(),
    };
  }
}
