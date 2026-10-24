import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenPair, TokensService } from './tokens.service';

export interface HouseholdSummary {
  id: string;
  name: string;
  timezone: string;
  role: string;
}

export interface SessionResponse extends TokenPair {
  user: { id: string; email: string; displayName: string };
  households: HouseholdSummary[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  async register(dto: RegisterDto): Promise<SessionResponse> {
    if (!this.config.getOrThrow<boolean>('MH_ALLOW_REGISTRATION')) {
      throw AppException.forbidden(
        ErrorCode.REGISTRATION_CLOSED,
        "Les inscriptions sont fermées sur ce serveur. Demandez un code d'invitation à son administrateur.",
      );
    }

    const email = dto.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          displayName: dto.displayName.trim(),
          passwordHash,
          timezone: dto.timezone ?? null,
        },
        select: { id: true, email: true, displayName: true },
      });

      return this.buildSession(user, await this.tokens.issue(user.id));
    } catch (error) {
      // On s'appuie sur la contrainte d'unicité plutôt que sur un
      // « SELECT puis INSERT » : deux inscriptions simultanées avec le
      // même e-mail passeraient entre les deux.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw AppException.conflict(
          ErrorCode.EMAIL_ALREADY_USED,
          'Un compte existe déjà avec cette adresse.',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<SessionResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
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
      { id: user.id, email: user.email, displayName: user.displayName },
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
      select: { id: true, email: true, displayName: true },
    });
    return {
      user,
      households: await this.householdsOf(userId),
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

  private async householdsOf(userId: string): Promise<HouseholdSummary[]> {
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId, deletedAt: null, household: { deletedAt: null } },
      select: {
        role: true,
        household: { select: { id: true, name: true, timezone: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.household.id,
      name: m.household.name,
      timezone: m.household.timezone,
      role: m.role,
    }));
  }

  private async buildSession(
    user: { id: string; email: string; displayName: string },
    tokens: TokenPair,
  ): Promise<SessionResponse> {
    return { ...tokens, user, households: await this.householdsOf(user.id) };
  }
}
