import sanitizeHtml, { type Attributes } from 'sanitize-html';

const AUCUN: Attributes = {};

/**
 * Les détails d'une tâche sont du texte mis en forme : gras, italique,
 * souligné, barré, couleur, surligneur, listes et cases à cocher. Ils
 * arrivent en HTML, et n'en gardent que cela : rien qui s'exécute, rien
 * qui charge quoi que ce soit, aucune mise en page — le web et l'app
 * doivent pouvoir afficher tout ce qui est accepté.
 */

/** Les couleurs de la palette : le texte et le surligneur n'en prennent pas d'autres. */
export const COULEURS_DU_TEXTE = ['#111827', '#b91c1c', '#b45309', '#15803d', '#1d4ed8', '#7c3aed'];
export const COULEURS_DU_SURLIGNEUR = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e5e7eb'];

const COULEUR = /^#[0-9a-f]{6}$/i;

function couleurDe(style: string, propriete: 'color' | 'background-color'): string | null {
  const trouve = new RegExp(`(?:^|;)\\s*${propriete}\\s*:\\s*([^;]+)`, 'i').exec(style);
  const valeur = trouve?.[1].trim().toLowerCase();
  if (!valeur) return null;
  if (COULEUR.test(valeur)) return valeur;
  // Les navigateurs écrivent la couleur choisie en rgb(…).
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(valeur);
  if (!rgb) return null;
  return '#' + rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
}

/** Nettoie les détails ; une chaîne vide, ou réduite à rien, devient null. */
export function nettoyerDetails(html: string | null | undefined): string | null {
  if (html == null) return null;
  const propre = sanitizeHtml(html, {
    allowedTags: ['font', 'p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'mark', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: {
      span: ['style'],
      font: ['color'],
      mark: ['style'],
      li: ['data-case'],
      a: ['href'],
    },
    allowedSchemes: ['http', 'https', 'tel', 'mailto'],
    transformTags: {
      strong: 'b',
      em: 'i',
      strike: 's',
      div: 'p',
      // Seules les couleurs de la palette passent : une couleur choisie
      // ailleurs serait illisible dans l'un des deux thèmes.
      span: (_tag, attributs) => {
        const couleur = couleurDe(attributs.style ?? '', 'color');
        const fond = couleurDe(attributs.style ?? '', 'background-color');
        if (fond && COULEURS_DU_SURLIGNEUR.includes(fond)) {
          return { tagName: 'mark', attribs: { style: `background-color: ${fond}` } };
        }
        return couleur && COULEURS_DU_TEXTE.includes(couleur)
          ? { tagName: 'span', attribs: { style: `color: ${couleur}` } }
          : // Un span sans couleur n'apporte rien : on garde son texte, pas la balise.
            { tagName: 'retire', attribs: AUCUN };
      },
      // <font color> : ce que le navigateur écrit pour une couleur de texte.
      font: (_tag, attributs) => {
        const couleur = couleurDe(`color: ${attributs.color ?? ''}`, 'color');
        return couleur && COULEURS_DU_TEXTE.includes(couleur)
          ? { tagName: 'span', attribs: { style: `color: ${couleur}` } }
          : { tagName: 'retire', attribs: AUCUN };
      },
      mark: (_tag, attributs) => {
        const fond = couleurDe(attributs.style ?? '', 'background-color');
        return {
          tagName: 'mark',
          attribs: fond && COULEURS_DU_SURLIGNEUR.includes(fond) ? { style: `background-color: ${fond}` } : AUCUN,
        };
      },
      li: (_tag, attributs) => ({
        tagName: 'li',
        attribs:
          attributs['data-case'] === 'oui' || attributs['data-case'] === 'non'
            ? { 'data-case': attributs['data-case'] }
            : AUCUN,
      }),
    },
  }).trim();
  const texte = sanitizeHtml(propre, { allowedTags: [], allowedAttributes: {} }).trim();
  return texte ? propre : null;
}
