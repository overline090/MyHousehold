import { Right } from '@prisma/client';

/**
 * Les droits portés par un statut. Le serveur exige un **droit**, jamais
 * un nom de statut : un foyer qui renomme « Adulte » en « Grand » ne
 * doit pas changer de comportement, et un foyer qui invente un statut
 * « Colocataire » ne doit pas avoir à patcher le serveur.
 */
export const TOUS_LES_DROITS: readonly Right[] = Object.values(Right);

/**
 * Les deux droits sans lesquels plus personne ne peut administrer le
 * foyer. Au moins un compte actif doit garder chacun d'eux, sinon le
 * foyer est définitivement bloqué : la règle est vérifiée au changement
 * de statut comme à la suppression d'un compte.
 */
export const DROITS_D_ADMINISTRATION: readonly Right[] = [
  Right.MANAGE_STATUSES,
  Right.MANAGE_SERVER,
];

export function aLeDroit(droits: readonly Right[], requis: Right): boolean {
  return droits.includes(requis);
}

/** Les droits d'administration que cet ensemble ne couvre pas. */
export function droitsAdministrationManquants(
  droits: readonly Right[],
): Right[] {
  return DROITS_D_ADMINISTRATION.filter((droit) => !droits.includes(droit));
}
