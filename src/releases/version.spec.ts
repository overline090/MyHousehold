import { compareVersions, isUpdateAvailable, parseVersion } from './version';

describe('parseVersion', () => {
  it('accepte les formes usuelles, avec ou sans « v »', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
    expect(parseVersion('v0.4.0')?.minor).toBe(4);
    expect(parseVersion('1.2.3-rc.1')?.prerelease).toBe('rc.1');
  });

  it('refuse ce qui n’est pas une version', () => {
    for (const input of ['', 'dernière', '1.2', 'v1', '1.2.3.4']) {
      expect(parseVersion(input)).toBeNull();
    }
  });
});

describe('compareVersions', () => {
  it('ordonne sur les trois nombres', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.4.0', '0.10.0')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('v1.2.4', '1.2.3')).toBe(1);
  });

  it('place une pré-version avant la version finale', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1);
  });

  it('traite une version illisible comme la plus ancienne', () => {
    expect(compareVersions('pas une version', '0.1.0')).toBe(-1);
  });
});

describe('isUpdateAvailable', () => {
  it('signale une version plus récente', () => {
    expect(isUpdateAvailable('0.3.0', '0.4.0')).toBe(true);
    expect(isUpdateAvailable('0.3.0', 'v0.3.1')).toBe(true);
  });

  it('ne propose rien si l’on est à jour ou en avance', () => {
    expect(isUpdateAvailable('0.4.0', '0.4.0')).toBe(false);
    expect(isUpdateAvailable('0.5.0', '0.4.0')).toBe(false);
  });

  it('ne pousse jamais vers une pré-version', () => {
    // Un foyer n'a rien à faire sur une version candidate.
    expect(isUpdateAvailable('0.3.0', '0.4.0-rc.1')).toBe(false);
  });

  it('ignore une version publiée illisible', () => {
    expect(isUpdateAvailable('0.3.0', 'latest')).toBe(false);
  });
});
