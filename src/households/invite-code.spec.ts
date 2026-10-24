import {
  generateInviteCode,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  normalizeInviteCode,
} from './invite-code';

describe('code d’invitation', () => {
  it('a la longueur attendue et n’utilise que l’alphabet autorisé', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect(code).toMatch(new RegExp(`^[${INVITE_ALPHABET}]+$`));
    }
  });

  it('exclut les caractères visuellement ambigus', () => {
    // Un code est lu à voix haute ou recopié depuis un écran : « 0 ou O ? »
    // est la première question qu'on se pose sinon.
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(INVITE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('ne produit pas deux fois le même code sur un petit échantillon', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode()));
    expect(codes.size).toBe(500);
  });

  it('normalise la saisie utilisateur', () => {
    expect(normalizeInviteCode('npqc-mrs3')).toBe('NPQCMRS3');
    expect(normalizeInviteCode(' npqc mrs3 ')).toBe('NPQCMRS3');
    expect(normalizeInviteCode('NPQCMRS3')).toBe('NPQCMRS3');
  });
});
