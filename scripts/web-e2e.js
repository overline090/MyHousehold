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
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
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

  // Tâches : la liste, puis une tâche « tous les 3 jours » qui commence plus tard
  await page.click('nav >> text=Tâches');
  await page.waitForSelector('.tableau .rang:not(.titres)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${S}/7-taches.png` });
  verifier('la liste des tâches montre la règle en clair', true, (await page.textContent('.tableau')).includes('Chaque jour, 11 h'));
  await page.click('button.ajouter');
  await page.waitForSelector('form.panneau');
  await page.fill('form.panneau label:has-text("Titre") input', 'Arroser le potager');
  await page.click('form.panneau button:has-text("Jours")');
  await page.fill('form.panneau input[aria-label="Nombre de jours"]', '3');
  const premierJour = await page.evaluate(() => { const d = new Date(Date.now() + 3 * 86400000); return d.toISOString().slice(0, 10); });
  await page.fill('form.panneau label:has-text("Premier jour") input', premierJour);
  await page.waitForTimeout(200);
  const apercu = await page.locator('.apercu span').allTextContents();
  await page.screenshot({ path: `${S}/8-tache-tous-les-3-jours.png` });
  verifier('l’aperçu montre trois fois, à 3 jours d’écart, dès le premier jour', 3, apercu.length);
  await page.click('form.panneau button[type=submit]');
  await page.waitForSelector('form.panneau', { state: 'detached' });
  await page.waitForTimeout(500);
  const rangee = page.locator('.rang', { hasText: 'Arroser le potager' });
  verifier('la tâche apparaît avec « Tous les 3 jours »', true, (await rangee.textContent()).includes('Tous les 3 jours'));
  await rangee.locator('button.titre').click();
  await page.waitForSelector('aside.panneau');
  verifier('ouverte, elle dit quand elle commence', true, (await page.textContent('aside.panneau .etat-boite')).includes('Commence'));
  await page.click('aside.panneau button:has-text("Modifier")');
  await page.waitForSelector('form.panneau');
  verifier('rouverte, elle garde son rythme et son premier jour', `3 ${premierJour}`,
    `${await page.inputValue('form.panneau input[aria-label="Nombre de jours"]')} ${await page.inputValue('form.panneau label:has-text("Premier jour") input')}`);
  await page.click('form.panneau button:has-text("Annuler")');

  // Copie automatique : une règle « après un mot-clé », essayée avant d'être enregistrée
  await page.click('nav >> text=Administration');
  await page.waitForSelector('text=Copie automatique');
  await page.click('button:has-text("Nouvelle règle")');
  await page.fill('form.formulaire label:has-text("Nom") input', 'Code du portail');
  await page.fill('form.formulaire label:has-text("Mot-clé") input', 'Code du portail');
  await page.fill('form.formulaire textarea', 'Code du portail : 4821B, merci.');
  verifier('l’essai trouve le code', true, (await page.textContent('form.formulaire')).includes('1 trouvé : 4821B'));
  await page.click('form.formulaire button[type=submit]');
  await page.waitForSelector('form.formulaire', { state: 'detached' });
  verifier('la règle est enregistrée', true, await page.isVisible('.rang:has-text("Après « Code du portail »")'));
  await page.screenshot({ path: `${S}/9-copie-automatique.png` });

  // Détails mis en forme : écrits dans la fiche, puis lus avec ce qu'ils reconnaissent
  await page.click('nav >> text=Tâches');
  await page.waitForSelector('.tableau .rang:not(.titres)');
  await page.locator('.rang', { hasText: 'Arroser le potager' }).locator('button.titre').click();
  await page.waitForSelector('aside.panneau');
  await page.click('aside.panneau button:has-text("Modifier")');
  await page.waitForSelector('form.panneau .zone');
  await page.click('form.panneau .zone');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('Appeler Paul');
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' au 06 12 34 56 78');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Code du portail : 4821B');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${S}/10-details-ecrire.png` });
  verifier('l’éditeur résume ce qu’il reconnaît', true, (await page.textContent('.detections')).includes('1 téléphone'));
  await page.click('form.panneau button[type=submit]');
  await page.waitForSelector('form.panneau', { state: 'detached' });
  await page.locator('.rang', { hasText: 'Arroser le potager' }).locator('button.titre').click();
  await page.waitForSelector('aside.panneau .texte-riche button.detecte');
  verifier('le gras est gardé', 'Appeler Paul', await page.textContent('aside.panneau .texte-riche b'));
  verifier('le téléphone est reconnu', true, await page.isVisible('aside.panneau button.detecte.telephone'));
  await page.click('aside.panneau button.detecte.telephone');
  verifier('un appui propose d’appeler', 'tel:0612345678', await page.getAttribute('.bulle a', 'href'));
  await page.screenshot({ path: `${S}/11-details-lire.png` });
  await page.click('aside.panneau button.detecte.copie');
  verifier('un appui sur le code le copie', '4821B', await page.evaluate(() => navigator.clipboard.readText()));
  await page.click('aside.panneau button:has-text("Fermer")');

  // Valider une tâche : C'est fait, l'état et les dernières fois le disent, puis annuler
  await page.locator('.rang', { hasText: 'Promener le chien' }).locator('button.titre').click();
  await page.waitForSelector('aside.panneau .etat');
  verifier('ouverte, elle dit à qui c’est le tour', true, (await page.textContent('aside.panneau .etat-boite')).includes('Paul'));
  await page.click('aside.panneau button:has-text("C’est fait")');
  await page.waitForSelector('aside.panneau .etat.fait');
  verifier('la tâche se dit faite', true, (await page.textContent('aside.panneau .etat-boite')).includes('Faite à'));
  verifier('les dernières fois la montrent', true, (await page.textContent('aside.panneau .historique')).includes('Faite'));
  await page.screenshot({ path: `${S}/12-tache-validee.png` });
  await page.click('aside.panneau button:has-text("Annuler : pas encore faite")');
  await page.waitForSelector('aside.panneau button:has-text("C’est fait")');
  verifier('annuler la remet à faire', true, (await page.textContent('aside.panneau .etat-boite')).includes('À faire aujourd’hui'));
  await page.click('aside.panneau button:has-text("Fermer")');

  // Agenda : le mois, le jour choisi, et un rendez-vous qui se répète
  await page.click('nav >> text=Agenda');
  await page.waitForSelector('.mois .case');
  await page.waitForTimeout(500);
  verifier('le mois montre les rendez-vous', true, (await page.textContent('.mois')).includes('Dentiste'));
  await page.screenshot({ path: `${S}/13-agenda.png` });
  await page.click('button:has-text("Nouveau rendez-vous")');
  await page.waitForSelector('form.panneau');
  await page.fill('form.panneau label:has-text("Titre") input', 'Vaccin du chat');
  await page.fill('form.panneau label:has-text("Lieu") input', 'Clinique des Lilas');
  await page.click('form.panneau button:has-text("Chaque semaine")');
  await page.click('form.panneau button[type=submit]');
  await page.waitForSelector('form.panneau', { state: 'detached' });
  await page.waitForTimeout(500);
  verifier('le rendez-vous paraît dans le jour choisi', true, (await page.textContent('.jour-choisi')).includes('Vaccin du chat'));
  await page.click('.segment button:has-text("Liste")');
  await page.waitForTimeout(500);
  verifier('il se répète chaque semaine', true, (await page.locator('.liste .element', { hasText: 'Vaccin du chat' }).count()) >= 5);
  await page.click('.segment button:has-text("Mois")');

  // Foyer : les membres, et ce qui a été fait ce mois-ci
  await page.click('nav >> text=Foyer');
  await page.waitForSelector('.membres .membre');
  await page.waitForTimeout(400);
  verifier('le foyer montre ses membres', 3, await page.locator('.membres .membre').count());
  verifier('et ce que chacun a fait ce mois', true, (await page.textContent('.membres')).includes('ce mois'));
  await page.screenshot({ path: `${S}/14-foyer.png` });

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
