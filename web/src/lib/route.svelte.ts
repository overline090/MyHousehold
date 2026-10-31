/**
 * La page affichée, d'après l'adresse. Pas de routeur : une poignée de
 * pages, et l'historique du navigateur qui fonctionne comme on l'attend
 * (précédent, suivant, adresse à partager).
 */
export const route = $state({ chemin: window.location.pathname });

export function aller(chemin: string): void {
  if (chemin === route.chemin) return;
  window.history.pushState({}, '', chemin);
  route.chemin = chemin;
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => {
  route.chemin = window.location.pathname;
});
