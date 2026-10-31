/**
 * L'interface web connectée, dans un vrai navigateur, contre un vrai
 * serveur : connexion, accueil en tuiles, personnalisation gardée,
 * session reprise au rechargement, ajout rapide, téléphone, déconnexion.
 *
 *   BASE=http://localhost:3000 node scripts/web-e2e.js [dossier-des-captures]
 *
 * Exige un serveur installé, avec le compte « marie » de
 * scripts/smoke-setup.sh et quelques tâches du jour.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const S = process.argv[2] ?? 'captures-web';
const BASE = process.env.BASE ?? 'http://localhost:3000';
fs.mkdirSync(S, { recursive: true });
const echecs = [];
const verifier = (l, a, o) => { if (a === o) console.log('  ✓ ' + l); else { console.log(`  ✗ ${l} — attendu ${a}, obtenu ${o}`); echecs.push(l); } };
(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Se connecter');
  await page.screenshot({ path: `${S}/1-connexion.png` });
  await page.fill('input[autocomplete=username]', 'marie');
  await page.fill('input[type=password]', 'mauvais mot de passe');
  await page.click('button[type=submit]');
  await page.waitForSelector('[role=alert]');
  verifier('un mauvais mot de passe est signalé', true, (await page.textContent('[role=alert]')).includes('incorrect'));
  await page.fill('input[type=password]', 'un mot de passe assez long');
  await page.click('button[type=submit]');
  await page.waitForSelector('.tuiles section');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${S}/2-accueil.png` });
  verifier('la tuile En retard est là', true, await page.isVisible('section[aria-label="En retard"]'));
  verifier('le fusible en retard y figure', true, (await page.textContent('section[aria-label="En retard"]')).includes('fusible'));
  verifier('Administration est dans la navigation', true, await page.isVisible('nav >> text=Administration'));

  // Cocher depuis l'accueil
  const avant = await page.locator('section[aria-label="Mes tâches du jour"] .case.cochee').count();
  await page.locator('section[aria-label="Mes tâches du jour"] .case:not(.cochee)').first().click();
  await page.waitForTimeout(800);
  verifier('cocher une tâche du jour', avant + 1, await page.locator('section[aria-label="Mes tâches du jour"] .case.cochee').count());

  // Replier la navigation
  await page.click('button[aria-label="Replier le menu"]');
  await page.waitForTimeout(300);
  verifier('la navigation se replie', true, await page.isVisible('nav.repliee'));
  await page.screenshot({ path: `${S}/3-replie.png` });
  await page.click('button[aria-label="Déplier le menu"]');

  // Personnaliser
  await page.click('text=Personnaliser');
  await page.waitForSelector('.tuiles.edition');
  // Échanger « Mes tâches du jour » et « Rendez-vous de la semaine » par la poignée
  const ordre = () => page.locator('.tuiles section').evaluateAll((s) => s.map((e) => e.getAttribute('aria-label')));
  const ordreAvant = await ordre();
  await page.locator('section[aria-label="Mes tâches du jour"] .poignee').dragTo(page.locator('section[aria-label="Rendez-vous de la semaine"]'));
  await page.waitForTimeout(200);
  const ordreApres = await ordre();
  verifier('deux tuiles s’échangent', true,
    ordreApres.indexOf('Mes tâches du jour') === ordreAvant.indexOf('Rendez-vous de la semaine') &&
    ordreApres.indexOf('Rendez-vous de la semaine') === ordreAvant.indexOf('Mes tâches du jour'));
  if (!echecs.length) {} else console.log('    ', ordreAvant, '→', ordreApres);
  // Tirer le bas d'« En retard » près du bas d'« Aujourd'hui » : elle s'y aligne
  const voisine = await page.locator('section[aria-label="Aujourd’hui"]').boundingBox();
  const bas = await page.locator('section[aria-label="En retard"] .bord-b').boundingBox();
  await page.mouse.move(bas.x + bas.width / 2, bas.y + bas.height / 2);
  await page.mouse.down();
  await page.mouse.move(bas.x + bas.width / 2, voisine.y + voisine.height + 6, { steps: 6 });
  verifier('le repère d’alignement apparaît', true, await page.isVisible('.repere'));
  await page.mouse.up();
  const alignee = await page.locator('section[aria-label="En retard"]').boundingBox();
  verifier('elle a la hauteur de sa voisine', Math.round(voisine.height), Math.round(alignee.height));
  // Redimensionner « En retard » par son coin : plus large, et une hauteur choisie
  const coin = await page.locator('section[aria-label="En retard"] .coin').boundingBox();
  await page.mouse.move(coin.x + coin.width / 2, coin.y + coin.height / 2);
  await page.mouse.down();
  await page.mouse.move(coin.x + 120, coin.y + 90, { steps: 8 });
  await page.screenshot({ path: `${S}/4a-redimensionner.png` });
  verifier('la taille s’affiche pendant qu’on tire', true, await page.isVisible('section[aria-label="En retard"] .mesure'));
  await page.mouse.up();
  const tailleChoisie = await page.locator('section[aria-label="En retard"]').evaluate((e) => ({ col: e.style.gridColumn, h: e.style.height }));
  verifier('la tuile s’est élargie', true, tailleChoisie.col !== 'span 8' && tailleChoisie.col.startsWith('span'));
  verifier('sa hauteur est une longueur entière', 0, parseInt(tailleChoisie.h) % 38);
  await page.locator('button[aria-label="Retirer À faire par les autres"]').click();
  await page.screenshot({ path: `${S}/4-personnaliser.png` });
  await page.click('button.primaire:has-text("Terminé")');
  await page.waitForTimeout(600);

  // Recharger : la session reprend par le cookie, la disposition est gardée
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tuiles section');
  await page.waitForTimeout(500);
  verifier('la session reprend après rechargement', true, await page.isVisible('text=Personnaliser'));
  const apres = await page.locator('section[aria-label="En retard"]').evaluate((e) => ({ col: e.style.gridColumn, h: e.style.height }));
  verifier('la taille choisie est gardée', JSON.stringify(tailleChoisie), JSON.stringify(apres));
  verifier('la tuile retirée reste retirée', false, await page.isVisible('section[aria-label="À faire par les autres"]'));

  // Ajout rapide
  await page.click('button.ajouter');
  await page.fill('form.feuille input:not([type])', 'Remplacer l’ampoule');
  await page.click('form.feuille button:has-text("Avant une date")');
  await page.screenshot({ path: `${S}/5-ajout.png` });
  await page.click('form.feuille button[type=submit]');
  await page.waitForSelector('form.feuille', { state: 'detached' });
  await page.waitForTimeout(600);
  verifier('l’ajout rapide crée la tâche', true, (await page.textContent('.tuiles')).includes('Remplacer l’ampoule'));

  // Menu du compte
  await page.click('button[aria-label="Mon compte"]');
  await page.screenshot({ path: `${S}/6-menu.png` });
  await page.click('text=Mes appareils');
  verifier('une page à venir le dit', true, await page.isVisible('text=prochaine version'));
  await page.goBack();
  await page.waitForTimeout(300);

  // Téléphone
  const mobile = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const m = await mobile.newPage();
  await m.goto(BASE + '/', { waitUntil: 'networkidle' });
  await m.waitForSelector('.tuiles section');
  await m.waitForTimeout(500);
  await m.screenshot({ path: `${S}/7-mobile.png` });
  verifier('pas de défilement horizontal à 390 px', false, await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
  await m.click('button[aria-label="Ouvrir le menu"]');
  await m.screenshot({ path: `${S}/8-mobile-menu.png` });

  // Déconnexion
  await page.click('button[aria-label="Mon compte"]');
  await page.click('text=Se déconnecter');
  await page.waitForSelector('text=Se connecter');
  await page.reload({ waitUntil: 'networkidle' });
  verifier('après déconnexion, le rechargement ne reconnecte pas', true, await page.isVisible('text=Se connecter'));

  verifier('aucune erreur dans la console', 0, erreurs.filter((e) => !/Failed to load resource/.test(e)).length);
  if (erreurs.length) console.log(erreurs.slice(0, 5));
  await nav.close();
  console.log(echecs.length ? `${echecs.length} échec(s)` : 'Tout est passé.');
  process.exit(echecs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
