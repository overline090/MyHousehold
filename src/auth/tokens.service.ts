import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

export interface AccessTokenPayload {
  /** Identifiant de l'utilisateur. */
  sub: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Hachage du jeton de rafraîchissement. SHA-256 suffit ici, contrairement
 * aux mots de passe : un jeton de 32 octets aléatoires n'est pas devinable
 * par force brute, le hachage sert seulement à ce qu'un vol de la base ne
 * donne pas de jeton utilisable.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  private get accessTtl(): number {
    return this.config.getOrThrow<number>('MH_ACCESS_TOKEN_TTL');
  }

  private get refreshTtl(): number {
    return this.config.getOrThrow<number>('MH_REFRESH_TOKEN_TTL');
  }

  /**
   * Le JWT ne porte que `sub`, volontairement : y mettre la liste des
   * foyers et des rôles figerait des droits qui peuvent changer avant
   * l'expiration du jeton.
   */
  async issue(userId: string, deviceId?: string | null): Promise<TokenPair> {
    return (await this.issueWithId(userId, deviceId)).pair;
  }

  /** Comme `issue`, mais rend aussi l'identifiant de la ligne créée. */
  private async issueWithId(
    userId: string,
    deviceId?: string | null,
  ): Promise<{ pair: TokenPair; refreshTokenId: string }> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId } satisfies AccessTokenPayload,
      { expiresIn: this.accessTtl },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        deviceId: deviceId ?? null,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: this.clock.in(this.refreshTtl),
      },
      select: { id: true },
    });

    return {
      pair: { accessToken, refreshToken, expiresIn: this.accessTtl },
      refreshTokenId: created.id,
    };
  }

  /**
   * Rotation : le jeton présenté est consommé et remplacé. Présenter un
   * jeton déjà remplacé signifie qu'il a été rejoué — donc probablement
   * volé — et toute la chaîne de l'utilisateur est révoquée.
   */
  async rotate(presented: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(presented);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw AppException.unauthorized(
        ErrorCode.REFRESH_TOKEN_INVALID,
        'Session expirée, reconnectez-vous.',
      );
    }

    if (stored.replacedById !== null) {
      await this.revokeAllForUser(stored.userId);
      throw AppException.unauthorized(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Session invalidée par mesure de sécurité, reconnectez-vous.',
      );
    }

    if (stored.revokedAt !== null || stored.expiresAt <= this.clock.now()) {
      throw AppException.unauthorized(
        ErrorCode.REFRESH_TOKEN_INVALID,
        'Session expirée, reconnectez-vous.',
      );
    }

    const next = await this.issueWithId(stored.userId, stored.deviceId);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: this.clock.now(),
        replacedById: next.refreshTokenId,
      },
    });

    return next.pair;
  }

  async revoke(presented: string): Promise<void> {
    // Pas d'erreur si le jeton est inconnu : se déconnecter deux fois
    // n'est pas un échec.
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(presented), revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }
}
