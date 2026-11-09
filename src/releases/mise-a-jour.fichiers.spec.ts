import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ecrirePolitique, lireOutil, lirePolitique } from './mise-a-jour.fichiers';

describe('fichiers de mise à jour', () => {
  let dossier: string;

  beforeEach(async () => {
    dossier = join(await mkdtemp(join(tmpdir(), 'mh-maj-')), 'mises-a-jour');
  });

  it('lit une politique par défaut, et la garde une fois écrite', async () => {
    expect(await lirePolitique(dossier)).toEqual({ automatique: true, heure: 4, majeures: false, maintenant: null });
    await ecrirePolitique(dossier, { automatique: false, heure: 2, majeures: true, maintenant: '2026-11-09T12:00:00.000Z' });
    expect(JSON.parse(await readFile(join(dossier, 'politique.json'), 'utf8'))).toMatchObject({ heure: 2, majeures: true });
    expect(await lirePolitique(dossier)).toMatchObject({ automatique: false, maintenant: '2026-11-09T12:00:00.000Z' });
  });

  it('dit l’outil actif s’il est passé il y a moins d’un quart d’heure', async () => {
    const midi = new Date('2026-11-09T12:00:00Z');
    expect(await lireOutil(dossier, midi)).toMatchObject({ present: false, actif: false });
    await mkdir(dossier, { recursive: true });
    await writeFile(
      join(dossier, 'etat.json'),
      JSON.stringify({ outil: 'docker', vu: '2026-11-09T11:50:00Z', enCours: true, derniere: { vers: '0.8.1', resultat: 'reussie' } }),
    );
    expect(await lireOutil(dossier, midi)).toMatchObject({ present: true, actif: true, enCours: true, mode: 'docker', derniere: { vers: '0.8.1' } });
    expect(await lireOutil(dossier, new Date('2026-11-09T12:30:00Z'))).toMatchObject({ actif: false, enCours: false });
  });
});
