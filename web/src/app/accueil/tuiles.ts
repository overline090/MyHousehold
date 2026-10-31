/** Une longueur entière de l'accueil : à peu près un centimètre à l'écran. */
export const UNITE = 38;
/** L'écart entre deux tuiles, en pixels — celui de la grille. */
export const ECART = 16;
/** À moins de cette distance du bord d'une voisine, la tuile s'y aligne. */
export const AIMANT = 14;
/** La plus petite hauteur qu'on puisse donner à une tuile. */
export const HAUTEUR_MIN = 2 * UNITE;

/** Combien de colonnes (sur 12) pour une largeur tirée à la souris. */
export function colonnesPour(largeur: number, largeurGrille: number): number {
  const colonne = (largeurGrille - 11 * ECART) / 12;
  return Math.min(12, Math.max(1, Math.round((largeur + ECART) / (colonne + ECART))));
}

export interface Voisine {
  nom: string;
  /** Haut et bas de la voisine, mesurés depuis le haut de la tuile qu'on redimensionne. */
  haut: number;
  bas: number;
}

/**
 * La hauteur où s'arrête une tuile qu'on tire : le bas d'une voisine
 * placée à côté d'elle si on en est assez près, sinon la longueur entière
 * la plus proche (1,05 → 1).
 */
export function aimanter(brute: number, voisines: Voisine[]): { hauteur: number; aligneSur: string | null } {
  const hauteur = Math.max(HAUTEUR_MIN, brute);
  let meilleure: { nom: string; bas: number; ecart: number } | null = null;
  for (const v of voisines) {
    // À côté : la voisine commence à peu près sur la même ligne.
    if (Math.abs(v.haut) > AIMANT || v.bas < HAUTEUR_MIN) continue;
    const ecart = Math.abs(v.bas - hauteur);
    if (ecart <= AIMANT && (!meilleure || ecart < meilleure.ecart)) {
      meilleure = { nom: v.nom, bas: v.bas, ecart };
    }
  }
  if (meilleure) return { hauteur: Math.round(meilleure.bas), aligneSur: meilleure.nom };
  return { hauteur: Math.max(HAUTEUR_MIN, Math.round(hauteur / UNITE) * UNITE), aligneSur: null };
}

/** « 5 » pour une longueur entière, « 5,3 » pour une hauteur alignée sur une voisine. */
export function uniteEnClair(hauteur: number): string {
  const n = Math.round((hauteur / UNITE) * 10) / 10;
  return String(n).replace('.', ',');
}
