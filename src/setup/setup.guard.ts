import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isPrivateAddress, looksProxied } from './network-address';
import { SetupService } from './setup.service';

/**
 * Protège le moment le plus vulnérable de la vie du serveur. Trois
 * protections cumulatives, décrites dans docs/setup-wizard.md.
 */
@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly setup: SetupService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const state = await this.setup.raw();

    // 1. L'installation est faite : il n'y a plus rien à installer.
    if (state.completedAt !== null) {
      throw AppException.conflict(
        ErrorCode.SETUP_ALREADY_DONE,
        'Ce serveur est déjà installé.',
      );
    }

    // 2. Derrière un reverse proxy, l'adresse vue n'est plus celle du
    //    visiteur : le jeton d'installation prend le relais, et on le
    //    dit plutôt que de laisser passer en silence.
    const token = request.headers['x-setup-token'];
    if (looksProxied(request.headers)) {
      if (token !== state.setupToken) {
        throw AppException.forbidden(
          ErrorCode.SETUP_TOKEN_REQUIRED,
          "Ce serveur est derrière un proxy : l'installation demande le jeton affiché dans les journaux au premier démarrage.",
        );
      }
    } else if (!isPrivateAddress(request.ip) && token !== state.setupToken) {
      throw AppException.forbidden(
        ErrorCode.SETUP_REMOTE_FORBIDDEN,
        "L'installation ne se fait que depuis le réseau local.",
      );
    }

    // 3. Un serveur oublié sur une étagère ne reste pas éternellement
    //    adoptable : passé 24 h sans compte créé, il faut le redémarrer
    //    pour réarmer l'assistant.
    if (this.setup.windowClosed(state)) {
      throw AppException.forbidden(
        ErrorCode.SETUP_WINDOW_CLOSED,
        "La fenêtre d'installation est fermée. Redémarrez le serveur pour la rouvrir.",
      );
    }

    return true;
  }
}
