import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La version du serveur, lue dans son package.json. `npm_package_version`
 * n'existe que lancé par npm : ni l'image Docker ni le service systemd
 * ne passent par lui.
 */
export function versionCourante(): string {
  for (const dossier of [process.cwd(), join(__dirname, '..', '..')]) {
    try {
      const v = (JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8')) as { version?: string }).version;
      if (v) return v;
    } catch {
      // Dossier suivant.
    }
  }
  return process.env.npm_package_version ?? '0.0.0';
}
