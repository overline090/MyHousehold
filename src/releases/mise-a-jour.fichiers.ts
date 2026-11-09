import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Ce que l'administrateur règle : l'outil de mise à jour le lit.
 *
 * Le serveur ne se met pas à jour lui-même — il faudrait lui confier la
 * machine entière. Un outil à part, installé à côté (un conteneur avec
 * Docker, un minuteur systemd sinon), lit ce fichier, fait la mise à
 * jour, et écrit où il en est dans `etat.json`. Les deux ne se parlent
 * que par ces deux fichiers, dans le dossier de données.
 */
export interface PolitiqueDeMiseAJour {
  /** Installer seul les nouvelles versions, la nuit. */
  automatique: boolean;
  /** L'heure locale (0–23) à laquelle l'outil peut agir. */
  heure: number;
  /** Les versions majeures aussi ; sinon, elles attendent un « Mettre à jour maintenant ». */
  majeures: boolean;
  /** Demande d'une mise à jour immédiate : l'instant de la demande, ou null. */
  maintenant: string | null;
}

/** Ce que l'outil de mise à jour écrit. Tout est facultatif : il peut être d'une autre version. */
export interface EtatDeLOutil {
  outil?: 'docker' | 'classique';
  /** Le dernier passage de l'outil : s'il date, l'outil ne tourne plus. */
  vu?: string;
  enCours?: boolean;
  derniere?: {
    le?: string;
    de?: string;
    vers?: string;
    resultat?: 'reussie' | 'echouee' | 'differee';
    message?: string;
    sauvegarde?: string;
  };
}

export const PAR_DEFAUT: PolitiqueDeMiseAJour = { automatique: true, heure: 4, majeures: false, maintenant: null };

/** L'outil passe toutes les cinq minutes : au-delà d'un quart d'heure de silence, il ne tourne plus. */
const SILENCE_MAX_MS = 15 * 60 * 1000;

export async function lirePolitique(dossier: string): Promise<PolitiqueDeMiseAJour> {
  const lue = await lire<Partial<PolitiqueDeMiseAJour>>(dossier, 'politique.json');
  return { ...PAR_DEFAUT, ...(lue ?? {}) };
}

export async function ecrirePolitique(dossier: string, politique: PolitiqueDeMiseAJour): Promise<void> {
  await ecrire(dossier, 'politique.json', politique);
}

/** L'état de l'outil, et s'il est vivant à l'instant donné. */
export async function lireOutil(dossier: string, maintenant: Date) {
  const etat = await lire<EtatDeLOutil>(dossier, 'etat.json');
  const vu = etat?.vu ? new Date(etat.vu) : null;
  const valide = !!vu && !Number.isNaN(vu.getTime());
  const actif = valide && maintenant.getTime() - vu.getTime() < SILENCE_MAX_MS;
  return {
    present: !!etat,
    actif,
    mode: etat?.outil ?? null,
    vu: valide ? vu.toISOString() : null,
    enCours: actif && !!etat?.enCours,
    derniere: etat?.derniere ?? null,
  };
}

async function lire<T>(dossier: string, nom: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(dossier, nom), 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Écrit puis renomme : l'outil ne lit jamais un fichier à moitié écrit. */
async function ecrire(dossier: string, nom: string, contenu: unknown): Promise<void> {
  await mkdir(dossier, { recursive: true });
  const provisoire = join(dossier, `.${nom}.${process.pid}`);
  await writeFile(provisoire, JSON.stringify(contenu, null, 2) + '\n');
  await rename(provisoire, join(dossier, nom));
}
