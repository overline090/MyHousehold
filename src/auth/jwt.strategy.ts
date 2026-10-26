import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessTokenPayload } from './tokens.service';

import { Right } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: { id: string; name: string };
  /// Droits du statut, relus à chaque requête : un changement de statut
  /// prend effet sans attendre l'expiration du jeton.
  rights: Right[];
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
   * Le compte et son statut sont relus à chaque requête. C'est une
   * lecture de plus, mais elle permet qu'une suppression de compte ou un
   * changement de droits prenne effet immédiatement plutôt qu'à
   * l'expiration du jeton — et elle évite tout cache de droits à
   * invalider.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: { select: { id: true, name: true, rights: true } },
      },
    });

    if (!user) {
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, 'Session invalide.');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: { id: user.status.id, name: user.status.name },
      rights: user.status.rights,
    };
  }
}
