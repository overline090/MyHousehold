import { HouseholdRole } from '@prisma/client';

export interface SuccessorCandidate {
  userId: string;
  role: HouseholdRole;
  joinedAt: Date;
}

/**
 * Désigne qui reprend un foyer dont le dernier propriétaire supprime son
 * compte.
 *
 * Il n'y a pas d'exclusion dans ce modèle : on ne peut pas sortir
 * quelqu'un d'un foyer, et une suppression de compte ne doit jamais être
 * refusée — c'est un droit, pas une faveur. Il faut donc toujours une
 * réponse, et refuser la suppression « parce que vous êtes le dernier
 * propriétaire » n'est pas acceptable.
 *
 * Règle : le membre le plus ancien parmi les adultes ; à défaut le plus
 * ancien des enfants, plutôt que de détruire le foyer des autres. Les
 * invités sont écartés : un invité n'a pas vocation à administrer un
 * foyer. Sans aucun candidat, l'appelant supprime le foyer.
 */
export function pickOwnershipSuccessor(
  candidates: SuccessorCandidate[],
): SuccessorCandidate | null {
  const eligible = (role: HouseholdRole) =>
    candidates
      .filter((c) => c.role === role)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

  return (
    eligible(HouseholdRole.OWNER)[0] ??
    eligible(HouseholdRole.ADULT)[0] ??
    eligible(HouseholdRole.CHILD)[0] ??
    null
  );
}
