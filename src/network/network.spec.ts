import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateIPv4Addresses } from './local-addresses';
import { buildServerLink } from './server-link';
import { displayFingerprint, ensureCertificate } from './tls';

describe('certificat du serveur', () => {
  it('est créé une fois, puis relu à l’identique', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'mh-tls-'));
    const premier = ensureCertificate(dossier, ['localhost'], ['127.0.0.1']);
    const second = ensureCertificate(dossier, ['autre-nom'], ['10.0.0.9']);

    expect(premier.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // Jamais régénéré : l'app a retenu cette empreinte.
    expect(second.fingerprint).toBe(premier.fingerprint);
  });

  it('s’affiche en six groupes de quatre', () => {
    expect(displayFingerprint('7f3a91c20b5ed4a86e17c93f' + '0'.repeat(40))).toBe(
      '7F3A 91C2 0B5E D4A8 6E17 C93F',
    );
  });
});

describe('adresses locales', () => {
  const info = (address: string, internal = false) => ({
    address,
    family: 'IPv4' as const,
    internal,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    cidr: null,
  });

  it('préfère le réseau de la box, et écarte Docker et la boucle locale', () => {
    expect(
      privateIPv4Addresses({
        lo: [info('127.0.0.1', true)],
        docker0: [info('172.17.0.1')],
        eth0: [info('10.0.0.4')],
        wlan0: [info('192.168.1.20')],
        ppp0: [info('88.12.4.2')],
      }),
    ).toEqual(['192.168.1.20', '10.0.0.4']);
  });
});

describe('lien du QR code', () => {
  it('porte l’adresse, l’empreinte et le code', () => {
    const lien = new URL(
      buildServerLink({
        address: 'https://192.168.1.20:3443',
        fingerprint: 'ab',
        code: 'K7MP-4RQX',
      }),
    );
    expect(lien.protocol).toBe('myhousehold:');
    expect(lien.searchParams.get('adresse')).toBe('https://192.168.1.20:3443');
    expect(lien.searchParams.get('empreinte')).toBe('ab');
    expect(lien.searchParams.get('code')).toBe('K7MP-4RQX');
  });
});
