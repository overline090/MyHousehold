import type { Snippet } from 'svelte';

/**
 * La tête d'une page : ses boutons, et l'action principale, qui dit ce
 * qu'elle crée (« Nouvelle tâche », « Nouveau rendez-vous »…). La page
 * les déclare, le cadre les affiche à côté du titre de la page.
 */
export const barre = $state<{
  actions: Snippet | null;
  rafraichir: number;
  ajouter: { libelle: string; faire: () => void } | null;
  /** L'ajout rapide (tâche ou rendez-vous), ouvert depuis l'accueil. */
  ajoutRapide: boolean;
}>({
  actions: null,
  rafraichir: 0,
  ajouter: null,
  ajoutRapide: false,
});

/** Après un ajout : la page en cours se recharge. */
export function signalerUnChangement(): void {
  barre.rafraichir += 1;
}
