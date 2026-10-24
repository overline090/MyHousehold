import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessTokenPayload } from './tokens.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('MH_JWT_SECRET'),
    });
  }

  /**
   * Le compte est relu à chaque requête. C'est une lecture de plus, mais
   * elle permet qu'une suppression de compte prenne effet immédiatement
   * plutôt qu'à l'expiration du jeton.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, displayName: true },
    });

    if (!user) {
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, 'Session invalide.');
    }

    return user;
  }
}
