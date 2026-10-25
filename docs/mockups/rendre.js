const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Rend chaque maquette en PNG à la taille d'un écran d'ordinateur, et
// signale tout débordement — une maquette qui déborde ment sur ce
// qu'elle promet.
const SRC = __dirname;
const OUT = process.env.SORTIE ?? path.join(__dirname, 'png');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const navigateur = await chromium.launch();
  const fichiers = fs.readdirSync(SRC).filter((f) => f.endsWith('.html') && !f.startsWith('_'));

  for (const fichier of fichiers.sort()) {
    const page = await navigateur.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1.5,
    });
    await page.goto('file://' + path.join(SRC, fichier));
    await page.waitForLoadState('networkidle');

    const debordement = await page.evaluate(() => {
      // `body` est en `overflow: hidden` : c'est le conteneur défilant qui
      // dit la vérité, sinon une maquette coupée passe pour correcte.
      const corps = document.querySelector('.corps') ?? document.body;
      return {
        h: document.documentElement.scrollWidth > 1280,
        v: corps.scrollHeight > corps.clientHeight + 4,
      };
    });

    await page.screenshot({ path: path.join(OUT, fichier.replace('.html', '.png')) });
    await page.close();
    console.log(
      fichier.replace('.html', '.png'),
      debordement.h ? '⚠ déborde en largeur' : '',
      debordement.v ? '⚠ contenu coupé en hauteur' : '',
    );
  }

  await navigateur.close();
})();
