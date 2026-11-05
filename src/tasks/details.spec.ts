import { nettoyerDetails } from './details';

describe('nettoyerDetails', () => {
  it('garde la mise en forme permise', () => {
    expect(nettoyerDetails('<p><strong>Appeler</strong> <em>vite</em> <u>ici</u> <s>là</s></p>')).toBe(
      '<p><b>Appeler</b> <i>vite</i> <u>ici</u> <s>là</s></p>',
    );
  });

  it('garde toute couleur de texte, et le surligneur de la palette seulement', () => {
    expect(nettoyerDetails('<span style="color: #B91C1C">rouge</span>')).toMatch(
      /^<span style="color: ?#b91c1c">rouge<\/span>$/,
    );
    expect(nettoyerDetails('<span style="color: #123456">autre</span>')).toMatch(
      /^<span style="color: ?#123456">autre<\/span>$/,
    );
    expect(nettoyerDetails('<span style="color: red">nommée</span>')).toBe('nommée');
    expect(nettoyerDetails('<span style="background-color:#123456">fond</span>')).toBe('fond');
    expect(nettoyerDetails('<span style="background-color:#fde68a">surligné</span>')).toMatch(
      /^<mark style="background-color: ?#fde68a">surligné<\/mark>$/,
    );
  });

  it('lit les couleurs écrites en rgb par le navigateur', () => {
    expect(nettoyerDetails('<span style="background-color: rgb(253, 230, 138);">a</span>')).toMatch(
      /^<mark style="background-color: ?#fde68a">a<\/mark>$/,
    );
  });

  it('lit le surligneur et les couleurs écrits par l’app', () => {
    expect(nettoyerDetails('<span style="background: rgba(253, 230, 138, 1.0);">a</span>')).toMatch(
      /^<mark style="background-color: ?#fde68a">a<\/mark>$/,
    );
    expect(nettoyerDetails('<span style="color: rgba(185, 28, 28, 1.0);">b</span>')).toMatch(
      /^<span style="color: ?#b91c1c">b<\/span>$/,
    );
  });

  it('traduit <font color> en couleur de texte', () => {
    expect(nettoyerDetails('<font color="#1d4ed8">bleu</font>')).toMatch(/^<span style="color: ?#1d4ed8">bleu<\/span>$/);
  });

  it('retire ce qui pourrait s’exécuter ou charger quelque chose', () => {
    expect(nettoyerDetails('<p onclick="x()">a</p><script>alert(1)</script><img src="x">')).toBe('<p>a</p>');
    expect(nettoyerDetails('<a href="javascript:alert(1)">lien</a>')).toBe('<a>lien</a>');
  });

  it('garde les listes et l’état des cases', () => {
    expect(nettoyerDetails('<ul><li data-case="oui" class="x">fait</li><li data-case="peut-etre">b</li></ul>')).toBe(
      '<ul><li data-case="oui">fait</li><li>b</li></ul>',
    );
  });

  it('un texte vide devient null', () => {
    expect(nettoyerDetails('<p><br></p>')).toBeNull();
    expect(nettoyerDetails('')).toBeNull();
    expect(nettoyerDetails(null)).toBeNull();
  });
});
