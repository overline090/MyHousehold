import { randomInt } from 'node:crypto';

/**
 * Alphabet sans ambiguïté visuelle : ni 0/O, ni 1/I/L. Un code
 * d'invitation est lu à voix haute ou recopié depuis un écran, et
 * « 0 ou O ? » est la première question qu'on se pose sinon.
 */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

/**
 * 31^8 ≈ 8,5 × 10^11 combinaisons. Combiné à l'expiration et à la
 * limitation de débit, cela rend la devinette d'un code sans intérêt
 * pratique.
 */
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

/** Normalise une saisie utilisateur : majuscules, sans espaces ni tirets. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}
