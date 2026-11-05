import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Les icônes que l'on peut choisir : pour un tableau ou un article du
 * stock, pour un groupe de tâches. Le web et l'app les dessinent sous
 * les mêmes noms.
 */
export const ICONES = [
  'boite', 'bocal', 'flacon', 'medicament', 'ampoule', 'panier', 'outil', 'tasse', 'pomme', 'bouteille', 'savon', 'linge',
  'maison', 'lit', 'plante', 'voiture',
] as const;

/**
 * Une icône personnalisée : un emoji, ou une à deux lettres, écrit après
 * ce préfixe (« texte:🍝 », « texte:PR »). Elle s'affiche sur la couleur.
 */
export const PREFIXE_TEXTE = 'texte:';

const segmenteur = new Intl.Segmenter('fr', { granularity: 'grapheme' });

/** Une icône de la liste, ou un texte d'un ou deux caractères visibles. */
export function estUneIcone(valeur: unknown): boolean {
  if (typeof valeur !== 'string') return false;
  if ((ICONES as readonly string[]).includes(valeur)) return true;
  if (!valeur.startsWith(PREFIXE_TEXTE)) return false;
  const texte = valeur.slice(PREFIXE_TEXTE.length);
  // 16 unités : de quoi tenir un emoji composé (famille, drapeau), pas une phrase.
  if (texte.length < 1 || texte.length > 16 || texte.trim() !== texte) return false;
  // Rien d'invisible ni de balisable : ni caractère de contrôle, ni < > &.
  if (/[\p{Cc}<>&]/u.test(texte)) return false;
  const caracteres = [...segmenteur.segment(texte)].length;
  return caracteres >= 1 && caracteres <= 2;
}

/** Valide une icône : `null` est accepté à part (`ValidateIf`), pour « aucune ». */
export function EstUneIcone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'estUneIcone',
      validator: {
        validate: (valeur) => estUneIcone(valeur),
        defaultMessage: () =>
          `icon doit être l'une de : ${ICONES.join(', ')}, ou « ${PREFIXE_TEXTE} » suivi d'un emoji ou d'une à deux lettres`,
      },
    },
    options,
  );
}
