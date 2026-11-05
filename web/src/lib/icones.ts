/**
 * Les icônes que l'on peut choisir — tableaux et articles du stock,
 * groupes de tâches —, sous les mêmes noms que côté serveur.
 */
export const ICONES: Record<string, string> = {
  boite: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  bocal: '<path d="M7 3h10v3H7zM6 6h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M6 11h12"/>',
  flacon: '<path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z"/><path d="M8 13h8"/>',
  medicament: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 2h6v2H9zM12 9v6M9 12h6"/>',
  ampoule: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  panier: '<path d="M5 8h14l-1.5 11a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  outil: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  tasse: '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3"/>',
  pomme: '<path d="M12 7c-2-2-7-1.5-7 4 0 4 3 9 5 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-5 5-9 0-5.5-5-6-7-4z"/><path d="M12 7c0-2 1-4 3-4"/>',
  bouteille: '<path d="M10 2h4v5l1 2v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V9l1-2z"/>',
  savon: '<rect x="4" y="9" width="16" height="11" rx="3"/><path d="M9 9V6h6v3M12 3v3"/>',
  linge: '<path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3a4 4 0 0 1-8 0z"/>',
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  lit: '<path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  plante: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7z"/><path d="M12 14c0-3-2-5-7-5 0 4 2 5 7 5z"/><path d="M8 21h8"/>',
  voiture: '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
};

/** Une icône personnalisée : « texte: » suivi d'un emoji ou d'une à deux lettres. */
export const PREFIXE_TEXTE = 'texte:';

/** Le texte d'une icône personnalisée, ou null. */
export function texteDeLIcone(icon: string | null | undefined): string | null {
  return icon?.startsWith(PREFIXE_TEXTE) ? icon.slice(PREFIXE_TEXTE.length) : null;
}

const segmenteur = new Intl.Segmenter('fr', { granularity: 'grapheme' });

/** Un emoji ou une à deux lettres : la règle du serveur, vérifiée avant l'envoi. */
export function texteValide(texte: string): boolean {
  const n = [...segmenteur.segment(texte)].length;
  return n >= 1 && n <= 2 && texte.length <= 16 && texte.trim() === texte && !/[\p{Cc}<>&]/u.test(texte);
}

/** Blanc sur une couleur foncée, encre sur une couleur claire : l'icône reste lisible. */
export function encreSur(fond: string | null | undefined): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fond ?? '');
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#101715' : '#fff';
}

export type SorteDIcone = 'aucune' | 'icone' | 'perso' | 'image';

/** Ce que les formulaires éditent, lu depuis l'icône enregistrée. */
export function lireIcone(icon: string | null | undefined, parDefaut: string): { sorte: SorteDIcone; icone: string; texte: string } {
  const texte = texteDeLIcone(icon);
  if (texte) return { sorte: 'perso', icone: parDefaut, texte };
  if (icon && ICONES[icon]) return { sorte: 'icone', icone: icon, texte: '' };
  return { sorte: 'aucune', icone: parDefaut, texte: '' };
}

/** L'icône à envoyer au serveur ; null pour aucune (ou une image importée). */
export function ecrireIcone(sorte: SorteDIcone, icone: string, texte: string): string | null {
  if (sorte === 'icone') return icone;
  if (sorte === 'perso') return PREFIXE_TEXTE + texte.trim();
  return null;
}
