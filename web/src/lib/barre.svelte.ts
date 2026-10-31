import type { Snippet } from 'svelte';

/**
 * Les boutons propres à une page, posés dans la barre d'outils à gauche
 * d'« Ajouter » : la page les déclare, le cadre les affiche.
 */
export const barre = $state<{ actions: Snippet | null; rafraichir: number }>({
  actions: null,
  rafraichir: 0,
});

/** Après un ajout depuis la barre d'outils : la page en cours se recharge. */
export function signalerUnChangement(): void {
  barre.rafraichir += 1;
}
