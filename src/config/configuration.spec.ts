import { validateConfig } from './configuration';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  MH_JWT_SECRET: 'a'.repeat(44),
  MH_ENCRYPTION_KEY: 'b'.repeat(44),
  MH_PUBLIC_URL: 'https://household.example.com',
};

describe('validateConfig', () => {
  it('accepte une configuration complète et applique les valeurs par défaut', () => {
    const config = validateConfig({ ...valid });
    expect(config.PORT).toBe(3000);
    expect(config.MH_DEFAULT_TIMEZONE).toBe('Europe/Paris');
    expect(config.MH_EXPOSE_DOCS).toBe(false);
    expect(config.MH_ALLOW_REGISTRATION).toBe(true);
  });

  it('refuse de démarrer sans URL de base de données', () => {
    const { DATABASE_URL: _unused, ...incomplete } = valid;
    expect(() => validateConfig(incomplete)).toThrow(/DATABASE_URL/);
  });

  it('refuse un secret trop court', () => {
    // Un secret de 8 caractères donne une fausse impression de sécurité :
    // mieux vaut refuser de démarrer que de signer des jetons avec.
    expect(() => validateConfig({ ...valid, MH_JWT_SECRET: 'court' })).toThrow(
      /MH_JWT_SECRET/,
    );
  });

  it('exige la clé de chiffrement des agendas dès maintenant', () => {
    // Elle doit être fixée et sauvegardée AVANT que des identifiants
    // soient chiffrés avec elle, sinon ils deviennent irrécupérables.
    const { MH_ENCRYPTION_KEY: _unused, ...incomplete } = valid;
    expect(() => validateConfig(incomplete)).toThrow(/MH_ENCRYPTION_KEY/);
  });

  it('convertit les drapeaux textuels en booléens', () => {
    const config = validateConfig({
      ...valid,
      MH_ALLOW_REGISTRATION: 'false',
      MH_EXPOSE_DOCS: 'true',
    });
    expect(config.MH_ALLOW_REGISTRATION).toBe(false);
    expect(config.MH_EXPOSE_DOCS).toBe(true);
  });

  it('rejette une URL publique invalide', () => {
    expect(() => validateConfig({ ...valid, MH_PUBLIC_URL: 'pas-une-url' })).toThrow(
      /MH_PUBLIC_URL/,
    );
  });
});
