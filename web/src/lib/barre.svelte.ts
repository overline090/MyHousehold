import type { Snippet } from 'svelte';

/**
 * Les boutons propres à une page, posés dans la barre d'outils à gauche
 * d'« Ajouter » : la page les déclare, le cadre les affiche.
 */
export const barre = $state<{ actions: Snippet | null; rafraichir: number; ajouter: (() => void) | null }>({
  actions: null,
  rafraichir: 0,
  // Une page peut prendre « Ajouter » pour elle : sur Tâches, il ouvre la
  // fiche complète plutôt que l'ajout rapide.
  ajouter: null,
});

/** Après un ajout depuis la barre d'outils : la page en cours se recharge. */
export function signalerUnChangement(): void {
  barre.rafraichir += 1;
}
