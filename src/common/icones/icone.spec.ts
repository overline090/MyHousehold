import { estUneIcone } from './icone';

describe('estUneIcone', () => {
  it('accepte les icônes de la liste', () => {
    expect(estUneIcone('bocal')).toBe(true);
    expect(estUneIcone('maison')).toBe(true);
    expect(estUneIcone('fusee')).toBe(false);
  });

  it('accepte un emoji, même composé, ou une à deux lettres', () => {
    expect(estUneIcone('texte:🍝')).toBe(true);
    expect(estUneIcone('texte:👨‍👩‍👧')).toBe(true);
    expect(estUneIcone('texte:🇫🇷')).toBe(true);
    expect(estUneIcone('texte:PR')).toBe(true);
    expect(estUneIcone('texte:3')).toBe(true);
  });

  it('refuse le vide, les phrases, les espaces autour et les balises', () => {
    expect(estUneIcone('texte:')).toBe(false);
    expect(estUneIcone('texte:ABC')).toBe(false);
    expect(estUneIcone('texte: A')).toBe(false);
    expect(estUneIcone('texte:<b')).toBe(false);
    expect(estUneIcone('texte:a\u0000')).toBe(false);
    expect(estUneIcone(42)).toBe(false);
  });
});
