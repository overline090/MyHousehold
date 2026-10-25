import { isPrivateAddress, looksProxied } from './network-address';

describe('isPrivateAddress', () => {
  it('accepte les réseaux domestiques', () => {
    for (const addr of [
      '192.168.1.42',
      '10.0.0.7',
      '172.16.5.1',
      '172.31.255.254',
      '127.0.0.1',
      '::1',
      '169.254.3.9', // le point d'accès du Pi au premier démarrage
      '::ffff:192.168.1.42', // IPv4 encapsulée en IPv6
      'fd00::1234',
      'fe80::1',
    ]) {
      expect(isPrivateAddress(addr)).toBe(true);
    }
  });

  it('refuse les adresses publiques', () => {
    // Un Pi exposé par mégarde sur Internet ne doit pas être
    // installable depuis l'extérieur.
    for (const addr of [
      '8.8.8.8',
      '172.32.0.1', // juste au-dessus de la plage privée
      '172.15.255.255', // juste en dessous
      '193.168.1.1',
      '2a01:e0a::1',
      '11.0.0.1',
    ]) {
      expect(isPrivateAddress(addr)).toBe(false);
    }
  });

  it('refuse une adresse absente ou illisible', () => {
    expect(isPrivateAddress(undefined)).toBe(false);
    expect(isPrivateAddress('')).toBe(false);
    expect(isPrivateAddress('999.1.1.1')).toBe(false);
    expect(isPrivateAddress('pas une adresse')).toBe(false);
  });
});

describe('looksProxied', () => {
  it('repère un reverse proxy', () => {
    expect(looksProxied({ 'x-forwarded-for': '203.0.113.9' })).toBe(true);
    expect(looksProxied({ 'x-real-ip': '203.0.113.9' })).toBe(true);
    expect(looksProxied({ forwarded: 'for=203.0.113.9' })).toBe(true);
  });

  it('ne voit rien sur une requête directe', () => {
    expect(looksProxied({ host: 'myhousehold.local' })).toBe(false);
    expect(looksProxied({})).toBe(false);
  });
});
