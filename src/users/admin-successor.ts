export interface SuccessorCandidate {
  userId: string;
  createdAt: Date;
}

/**
 * Désigne qui reçoit l'administration du foyer quand le dernier compte
 * qui l'administrait supprime le sien.
 *
 * Une suppression de compte ne doit jamais être refusée — c'est un
 * droit, pas une faveur — donc il faut toujours une réponse. Refuser
 * « parce que vous êtes le dernier administrateur » reviendrait à
 * retenir quelqu'un dans le produit.
 *
 * Règle : le compte actif le plus ancien. Pas le plus actif, pas le plus
 * âgé : l'ancienneté est le seul critère que le serveur connaisse sans
 * se tromper, et le foyer corrigera lui-même depuis l'interface web.
 */
export function pickAdminSuccessor(
  candidates: SuccessorCandidate[],
): SuccessorCandidate | null {
  return (
    [...candidates].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ??
    null
  );
}
