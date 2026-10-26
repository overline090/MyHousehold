import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Right } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/jwt.strategy';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { REQUIRED_RIGHT_KEY } from '../decorators/require-right.decorator';
import { aLeDroit } from '../rights';

/**
 * Une machine sert un seul foyer : il n'y a plus de frontière
 * d'isolation à défendre, et la question devient « ce compte a-t-il le
 * droit de faire cela ? ».
 *
 * Les droits ne sont pas portés par le jeton — ils changeraient sans que
 * le jeton expire — mais relus à chaque requête, en même temps que le
 * compte (voir JwtStrategy). Il n'y a donc aucun cache à invalider : un
 * changement de statut prend effet immédiatement.
 *
 * Un droit manquant est un 403 : il n'y a plus d'existence à cacher,
 * donc plus de raison de répondre 404.
 */
@Injectable()
export class RightsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requis = this.reflector.getAllAndOverride<Right | undefined>(
      REQUIRED_RIGHT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requis) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, 'Session invalide.');
    }

    if (!aLeDroit(user.rights, requis)) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN_RIGHT,
        `Votre statut (« ${user.status.name} ») ne permet pas cette action.`,
        { requiredRight: requis, yourRights: user.rights },
      );
    }

    return true;
  }
}
