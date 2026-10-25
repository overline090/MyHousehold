// Chaque maquette porte un marqueur {{COTE:n}} ; ce script y pose la
// colonne de navigation partagée, avec la bonne entrée active. Une
// colonne recopiée dans cinq fichiers finit toujours par diverger.
const fs = require('node:fs');
const path = require('node:path');

const cote = fs.readFileSync(path.join(__dirname, '_cote.html'), 'utf8').trimEnd();

for (const fichier of fs.readdirSync(__dirname).filter((f) => f.endsWith('.html') && !f.startsWith('_'))) {
  const chemin = path.join(__dirname, fichier);
  const source = fs.readFileSync(chemin, 'utf8');
  const remplace = source.replace(/\{\{COTE:(\d)\}\}/g, (_, n) =>
    cote.replace(`class="C${n}"`, `class="C${n} actif"`),
  );
  if (remplace !== source) {
    fs.writeFileSync(chemin, remplace);
    console.log('colonne posée :', fichier);
  }
}
