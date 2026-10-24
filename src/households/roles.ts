import { HouseholdRole } from '@prisma/client';

/**
 * Hiérarchie des rôles. Un rang supérieur peut tout ce que peut un rang
 * inférieur, ce qui évite d'énumérer les permissions une par une.
 */
const RANK: Record<HouseholdRole, number> = {
  GUEST: 0,
  CHILD: 1,
  ADULT: 2,
  OWNER: 3,
};

export function rankOf(role: HouseholdRole): number {
  return RANK[role];
}

/** `role` est-il au moins aussi élevé que `required` ? */
export function hasAtLeastRole(role: HouseholdRole, required: HouseholdRole): boolean {
  return RANK[role] >= RANK[required];
}

/**
 * Rôle minimal pour créer et modifier le contenu du foyer (tâches,
 * compteurs, rendez-vous). Un enfant complète ce qui lui est assigné mais
 * ne redéfinit pas l'organisation du foyer.
 */
export const ROLE_TO_MANAGE_CONTENT: HouseholdRole = HouseholdRole.ADULT;

/** Rôle minimal pour compléter une tâche ou remettre un compteur à zéro. */
export const ROLE_TO_COMPLETE: HouseholdRole = HouseholdRole.CHILD;
