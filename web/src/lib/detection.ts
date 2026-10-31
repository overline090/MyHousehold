/**
 * Ce que les détails d'une tâche reconnaissent d'eux-mêmes : téléphones,
 * adresses, liens, et ce que les règles de copie automatique du foyer
 * repèrent. La détection se fait à l'affichage : le texte enregistré
 * reste tel qu'il a été écrit.
 */

export interface RegleDeCopie {
  id: string;
  nom: string;
  type: 'MOT_CLE' | 'FORMAT';
  motif: string;
  active: boolean;
}

export interface Reglages {
  telephones?: boolean;
  adresses?: boolean;
  liens?: boolean;
  regles?: RegleDeCopie[];
}

export type Sorte = 'telephone' | 'adresse' | 'lien' | 'copie';

export interface Trouvaille {
  debut: number;
  fin: number;
  sorte: Sorte;
  /** Ce qui est appelé, ouvert ou copié : le code sans son mot-clé, le numéro sans espaces… */
  valeur: string;
  /** Pour une règle de copie : son nom. */
  nom?: string;
}

const TELEPHONE = /(?<![\d+])(?:(?:\+|00)33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)|(?<![\d+])\+(?!33)\d{1,3}(?:[\s.-]?\d{2,4}){2,5}(?!\d)/g;

const VOIES =
  'rue|avenue|av\\.|boulevard|bd|chemin|place|impasse|all[ée]e|route|quai|cours|square|passage|voie|r[ée]sidence|lotissement|hameau|sentier|parvis|esplanade|faubourg|rond-point';
/** « 12 rue des Lilas », suivi s'il y en a d'un code postal et d'une ville. */
const ADRESSE = new RegExp(
  `(?<![\\w])\\d{1,4}(?:\\s?(?:bis|ter|[a-c]))?,?\\s+(?:${VOIES})\\s+[A-Za-zÀ-ÿ'’ .-]{2,60}?` +
    `(?:,?\\s+\\d{5}\\s+[A-Za-zÀ-ÿ'’-]+(?:[ -][A-Za-zÀ-ÿ'’-]+){0,3})?(?=$|[\\n,;.)!?]|\\s{2})`,
  'gi',
);

const LIEN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Un format en mots simples : # = un chiffre, A = une lettre, * = l'un ou l'autre. */
export function formatVersExpression(motif: string): RegExp {
  const corps = [...motif]
    .map((c) => (c === '#' ? '\\d' : c === 'A' ? '[A-Za-z]' : c === '*' ? '[A-Za-z0-9]' : echapper(c)))
    .join('');
  return new RegExp(`(?<![A-Za-z0-9])${corps}(?![A-Za-z0-9])`, 'g');
}

/** Après un mot-clé : ce qui le suit, jusqu'à l'espace ou la ponctuation. */
function motCleVersExpression(motif: string): RegExp {
  return new RegExp(`${echapper(motif.trim())}\\s*[:=–-]?\\s*([^\\s,;]+[^\\s,;.!?)])`, 'gi');
}

function toutes(expression: RegExp, texte: string, fabrique: (m: RegExpExecArray) => Trouvaille | null): Trouvaille[] {
  const resultat: Trouvaille[] = [];
  expression.lastIndex = 0;
  for (let m = expression.exec(texte); m; m = expression.exec(texte)) {
    const t = fabrique(m);
    if (t) resultat.push(t);
    if (m[0].length === 0) expression.lastIndex++;
  }
  return resultat;
}

/** Tout ce qui se reconnaît dans un texte, sans chevauchement, dans l'ordre. */
export function detecter(texte: string, reglages: Reglages = {}): Trouvaille[] {
  const candidates: Trouvaille[] = [];

  // Les règles du foyer d'abord : elles sont plus précises que les autres.
  for (const regle of reglages.regles ?? []) {
    if (!regle.active || !regle.motif.trim()) continue;
    if (regle.type === 'FORMAT') {
      candidates.push(
        ...toutes(formatVersExpression(regle.motif), texte, (m) => ({
          debut: m.index,
          fin: m.index + m[0].length,
          sorte: 'copie',
          valeur: m[0],
          nom: regle.nom,
        })),
      );
    } else {
      candidates.push(
        ...toutes(motCleVersExpression(regle.motif), texte, (m) => {
          const debut = m.index + m[0].length - m[1].length;
          return { debut, fin: debut + m[1].length, sorte: 'copie', valeur: m[1], nom: regle.nom };
        }),
      );
    }
  }
  if (reglages.liens !== false) {
    candidates.push(...toutes(LIEN, texte, (m) => ({ debut: m.index, fin: m.index + m[0].length, sorte: 'lien', valeur: m[0] })));
  }
  if (reglages.telephones !== false) {
    candidates.push(
      ...toutes(TELEPHONE, texte, (m) => ({
        debut: m.index,
        fin: m.index + m[0].length,
        sorte: 'telephone',
        valeur: m[0].replace(/[\s.-]/g, '').replace(/^00/, '+'),
      })),
    );
  }
  if (reglages.adresses !== false) {
    candidates.push(
      ...toutes(ADRESSE, texte, (m) => {
        const valeur = m[0].trim();
        return { debut: m.index, fin: m.index + valeur.length, sorte: 'adresse', valeur };
      }),
    );
  }

  // Sans chevauchement : la première trouvée garde sa place.
  const retenues: Trouvaille[] = [];
  for (const c of candidates) {
    if (!retenues.some((r) => c.debut < r.fin && r.debut < c.fin)) retenues.push(c);
  }
  return retenues.sort((a, b) => a.debut - b.debut);
}

/** « 1 téléphone · 1 adresse · 1 code à copier » */
export function resume(trouvailles: Trouvaille[]): string[] {
  const compte = (s: Sorte) => trouvailles.filter((t) => t.sorte === s).length;
  const morceaux: string[] = [];
  const n = (k: number, un: string, plusieurs: string) => `${k} ${k > 1 ? plusieurs : un}`;
  if (compte('telephone')) morceaux.push(`☎ ${n(compte('telephone'), 'téléphone', 'téléphones')}`);
  if (compte('adresse')) morceaux.push(`⌖ ${n(compte('adresse'), 'adresse', 'adresses')}`);
  if (compte('lien')) morceaux.push(`↗ ${n(compte('lien'), 'lien', 'liens')}`);
  const copies = trouvailles.filter((t) => t.sorte === 'copie');
  if (copies.length) {
    const noms = [...new Set(copies.map((c) => c.nom))].join(', ');
    morceaux.push(`⧉ ${n(copies.length, 'code à copier', 'codes à copier')} · ${noms}`);
  }
  return morceaux;
}
