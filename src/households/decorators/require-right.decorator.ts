import { SetMetadata } from '@nestjs/common';
import { Right } from '@prisma/client';

export const REQUIRED_RIGHT_KEY = 'requiredRight';

/**
 * Droit exigé par la route. Sans ce décorateur, une route authentifiée
 * n'exige aucun droit particulier — c'est le cas de tout ce qui concerne
 * son propre compte.
 */
export const RequireRight = (right: Right) => SetMetadata(REQUIRED_RIGHT_KEY, right);
