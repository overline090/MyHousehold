/** Ce que le plugin Gestion de stock échange avec le serveur. */

export interface Tableau {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  hasImage: boolean;
  position: number;
  updatedAt: string;
  itemCount: number;
}

export interface Groupe {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
}

export interface Mouvement {
  id: string;
  delta: number;
  note: string | null;
  createdAt: string;
  actor: { id: string; firstName: string } | null;
}

export interface Article {
  id: string;
  boardId: string;
  groupId: string | null;
  /** Code-barres ou contenu du QR code ; le scanner, dans l'app, ouvre « Retirer ». */
  barcode: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  hasImage: boolean;
  quantity: number;
  minimum: number | null;
  expiresOn: string | null;
  link: string | null;
  detail: string | null;
  position: number;
  updatedAt: string;
  toBuy: boolean;
  expired: boolean;
  expiresSoon: boolean;
  boardName?: string | null;
}

export function imageDuTableau(t: Tableau): string | null {
  return t.hasImage ? `/api/v1/stock/boards/${t.id}/image?v=${encodeURIComponent(t.updatedAt)}` : null;
}

export function imageDeLArticle(a: Article): string | null {
  return a.hasImage ? `/api/v1/stock/items/${a.id}/image?v=${encodeURIComponent(a.updatedAt)}` : null;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 12 mars 2027 », « Dans 9 jours », « Périmé depuis 2 jours ». */
export function peremptionEnClair(jour: string, aujourdHui: string): { texte: string; alerte: boolean } {
  const ecart = Math.round((new Date(`${jour}T12:00:00Z`).getTime() - new Date(`${aujourdHui}T12:00:00Z`).getTime()) / 86_400_000);
  if (ecart < 0) return { texte: `Périmé depuis ${-ecart} jour${-ecart > 1 ? 's' : ''}`, alerte: true };
  if (ecart === 0) return { texte: 'Périme aujourd’hui', alerte: true };
  if (ecart <= 15) return { texte: `Dans ${ecart} jour${ecart > 1 ? 's' : ''}`, alerte: true };
  const d = new Date(`${jour}T12:00:00Z`);
  return { texte: `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, alerte: false };
}
