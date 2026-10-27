// Rend le cadre : 1280 × 800 pour l'ordinateur, 390 × 844 pour le téléphone.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const navigateur = await chromium.launch();
  const sortie = path.join(__dirname, 'png');
  fs.mkdirSync(sortie, { recursive: true });
  for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.html')).sort()) {
    const mobile = f.includes('mobile');
    const page = await navigateur.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      deviceScaleFactor: mobile ? 2 : 1.5,
    });
    await page.goto('file://' + path.join(__dirname, f));
    await page.screenshot({ path: path.join(sortie, f.replace('.html', '.png')) });
    await page.close();
    console.log(f);
  }
  await navigateur.close();
})();
