/**
 * Comparaison de versions sémantiques, réduite à ce dont le projet a
 * besoin : savoir si une version publiée est plus récente que celle qui
 * tourne.
 *
 * Les pré-versions (`1.2.0-rc.1`) sont considérées comme antérieures à
 * la version finale correspondante, et ne sont jamais proposées comme
 * mise à jour — un foyer n'a rien à faire sur une version candidate.
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export function parseVersion(input: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/** -1, 0 ou 1. Une version illisible est traitée comme la plus ancienne. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);

  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }

  if (left.prerelease === right.prerelease) return 0;
  // Une pré-version précède la version finale du même numéro.
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

/**
 * Y a-t-il une mise à jour à proposer ? Les pré-versions sont écartées :
 * on ne pousse pas un foyer vers une version candidate.
 */
export function isUpdateAvailable(current: string, published: string): boolean {
  const parsed = parseVersion(published);
  if (!parsed || parsed.prerelease !== null) {
    return false;
  }
  return compareVersions(published, current) > 0;
}
