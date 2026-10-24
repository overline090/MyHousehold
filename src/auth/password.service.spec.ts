import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produit une empreinte Argon2id vérifiable', async () => {
    const hash = await service.hash('un mot de passe long');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(hash, 'un mot de passe long')).resolves.toBe(true);
  });

  it('refuse un mauvais mot de passe', async () => {
    const hash = await service.hash('un mot de passe long');
    await expect(service.verify(hash, 'autre chose')).resolves.toBe(false);
  });

  it('ne lève pas d’erreur sur une empreinte corrompue', async () => {
    // Une empreinte illisible est un échec d'authentification, pas une 500.
    await expect(service.verify('pas-une-empreinte', 'peu importe')).resolves.toBe(false);
  });

  it('deux empreintes du même mot de passe diffèrent (sel aléatoire)', async () => {
    const [a, b] = await Promise.all([
      service.hash('identique'),
      service.hash('identique'),
    ]);
    expect(a).not.toBe(b);
  });

  it('fournit une empreinte leurre stable et vérifiable', async () => {
    const decoy = await service.decoyHash();
    expect(await service.decoyHash()).toBe(decoy);
    expect(decoy.startsWith('$argon2id$')).toBe(true);
    // Elle doit coûter le même temps qu'une vraie vérification, donc être
    // une empreinte valide et non une chaîne arbitraire.
    await expect(service.verify(decoy, 'mot de passe quelconque')).resolves.toBe(false);
  });
});
