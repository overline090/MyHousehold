import { hashRefreshToken } from './tokens.service';

describe('hashRefreshToken', () => {
  it('est déterministe', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
  });

  it('diffère pour deux jetons distincts', () => {
    expect(hashRefreshToken('abc')).not.toBe(hashRefreshToken('abd'));
  });

  it('ne laisse pas deviner le jeton d’origine', () => {
    const token = 'jeton-de-rafraichissement-en-clair';
    const hash = hashRefreshToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
