import { AssignmentMode } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/**
 * Désigne qui doit faire une occurrence, d'après sa position dans la
 * série.
 *
 * Volontairement déterministe : l'assignation se déduit de la position de
 * l'occurrence, et non d'un compteur que l'on incrémenterait à chaque
 * génération. Un compteur dérive dès qu'une occurrence est regénérée ou
 * supprimée, et personne ne comprend plus pourquoi c'est son tour.
 */
export function assigneeForOrdinal(
  mode: AssignmentMode,
  assigneeIds: string[],
  ordinal: number,
): string | null {
  if (mode === AssignmentMode.ANYONE || assigneeIds.length === 0) {
    return null;
  }

  if (mode === AssignmentMode.FIXED) {
    return assigneeIds[0];
  }

  // Modulo sur une position toujours positive.
  const index =
    ((ordinal % assigneeIds.length) + assigneeIds.length) % assigneeIds.length;
  return assigneeIds[index];
}

/**
 * Vérifie que le mode d'assignation et la liste de personnes sont
 * cohérents, avant d'écrire quoi que ce soit.
 *
 * Chaque occurrence n'a qu'un seul assigné : « plusieurs personnes
 * fixes » n'a donc pas de sens, c'est soit un tour de rôle, soit une
 * tâche que n'importe qui prend.
 */
export function assertAssignmentIsCoherent(
  mode: AssignmentMode,
  assigneeIds: string[],
): void {
  const unique = new Set(assigneeIds);
  if (unique.size !== assigneeIds.length) {
    throw AppException.badRequest(
      ErrorCode.INVALID_ASSIGNMENT,
      'La même personne apparaît deux fois dans la liste.',
    );
  }

  switch (mode) {
    case AssignmentMode.ANYONE:
      if (assigneeIds.length > 0) {
        throw AppException.badRequest(
          ErrorCode.INVALID_ASSIGNMENT,
          "Une tâche ouverte à tous ne désigne personne : retirez la liste, ou choisissez un autre mode d'assignation.",
        );
      }
      return;

    case AssignmentMode.FIXED:
      if (assigneeIds.length !== 1) {
        throw AppException.badRequest(
          ErrorCode.INVALID_ASSIGNMENT,
          'Une tâche fixe désigne exactement une personne. Pour plusieurs personnes, utilisez le tour de rôle.',
        );
      }
      return;

    case AssignmentMode.ROTATION:
      if (assigneeIds.length < 2) {
        throw AppException.badRequest(
          ErrorCode.INVALID_ASSIGNMENT,
          'Un tour de rôle demande au moins deux personnes.',
        );
      }
      return;
  }
}
