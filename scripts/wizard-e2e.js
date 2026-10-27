/**
 * Déroule l'assistant d'installation dans un vrai navigateur, contre un
 * vrai serveur, et capture chaque étape.
 *
 *   BASE=http://localhost:3000 node scripts/wizard-e2e.js
 *
 * Exige un serveur **vierge**, comme scripts/smoke-setup.sh : le
 * parcours termine l'installation. Playwright doit être installé
 * (`npm i -D playwright` ou une installation globale).
 *
 * Les captures sont écrites dans le dossier donné par SORTIE, ou dans
 * ./captures-assistant.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');

const BASE = process.env.BASE ?? 'http://localhost:3010';
const SORTIE = process.env.SORTIE ?? 'captures-assistant';
fs.mkdirSync(SORTIE, { recursive: true });

const echecs = [];
function verifier(libelle, attendu, obtenu) {
  if (attendu === obtenu) {
    console.log(`  ✓ ${libelle}`);
  } else {
    console.log(`  ✗ ${libelle} — attendu ${attendu}, obtenu ${obtenu}`);
    echecs.push(libelle);
  }
}

(async () => {
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({
    viewport: { width: 1040, height: 760 },
    deviceScaleFactor: 2,
  });

  const erreursConsole = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erreursConsole.push(m.text());
  });
  page.on('pageerror', (e) => erreursConsole.push(String(e)));

  console.log('Étape 2 — reprendre depuis l’app');
  await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h2');
  verifier(
    'la page s’ouvre sur la première étape applicable',
    true,
    (await page.textContent('h2')).includes('application'),
  );
  verifier(
    'la barre de progression montre quatre étapes applicables',
    '1 sur 4',
    (await page.textContent('.muet')).replace('Étape ', '').trim(),
  );
  await page.screenshot({ path: `${SORTIE}/1-app.png` });

  console.log('Étape 3 — le foyer');
  await page.getByRole('button', { name: 'Continuer sans importer' }).click();
  await page.waitForSelector('#nom');
  await page.screenshot({ path: `${SORTIE}/2-foyer.png` });
  await page.fill('#nom', 'Maison des Dupont');
  await page.getByRole('button', { name: 'Continuer' }).click();

  console.log('Étape 4 — premier compte');
  await page.waitForSelector('.code');
  const code = (await page.textContent('.code')).trim();
  verifier('un code d’appariement est affiché', true, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code));
  await page.screenshot({ path: `${SORTIE}/3-compte.png` });

  // Le téléphone, simulé : il crée le compte avec le code affiché.
  const reponse = await fetch(`${BASE}/setup/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      username: 'marie',
      password: 'un mot de passe assez long',
      firstName: 'Marie',
      lastName: 'Dupont',
    }),
  });
  verifier('le téléphone crée le compte administrateur', 201, reponse.status);

  console.log('Étape 5 — terminé');
  // La page interroge le serveur : elle doit avancer d'elle-même.
  await page.waitForSelector('text=est en place', { timeout: 15000 });
  verifier(
    'la page avance seule quand le téléphone a répondu',
    true,
    (await page.textContent('h2')).includes('Maison des Dupont'),
  );
  await page.screenshot({ path: `${SORTIE}/4-termine.png` });

  await page.getByRole('button', { name: "Terminer l'installation" }).click();
  await page.waitForSelector('text=inscriptions libres');
  await page.screenshot({ path: `${SORTIE}/5-verrouille.png` });

  const etat = await (await fetch(`${BASE}/setup/state`)).json();
  verifier(
    'le serveur considère l’installation faite',
    'SETUP_ALREADY_DONE',
    etat?.error?.code,
  );

  console.log('Téléphone et largeur mobile');
  const mobile = await navigateur.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await mobile.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
  await mobile.waitForSelector('.encadre');
  await mobile.screenshot({ path: `${SORTIE}/6-mobile-apres.png` });
  const debordement = await mobile.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  verifier('aucun débordement horizontal à 390 px', false, debordement);

  verifier('aucune erreur de console', 0, erreursConsole.length);
  if (erreursConsole.length) console.log(erreursConsole.slice(0, 3));

  await navigateur.close();
  console.log(echecs.length === 0 ? '\nTout est passé.' : `\n${echecs.length} échec(s).`);
  process.exit(echecs.length === 0 ? 0 : 1);
})();
