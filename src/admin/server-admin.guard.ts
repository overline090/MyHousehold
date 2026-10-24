import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AppException } from '../common/errors/app.exception';

/**
 * Administrateur de l'instance : un rôle au niveau du serveur, distinct
 * du rôle dans un foyer. Le propriétaire d'un foyer n'administre pas
 * l'instance, et réciproquement.
 *
 * Refus en 404, comme pour l'isolation des foyers : l'existence d'une
 * zone d'administration n'a pas à être confirmée à qui n'y a pas droit.
 */
@Injectable()
export class ServerAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user?.isServerAdmin) {
      throw AppException.notFound();
    }
    return true;
  }
}
