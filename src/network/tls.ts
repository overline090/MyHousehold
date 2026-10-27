import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TlsMaterial {
  key: string;
  cert: string;
  /** SHA-256 du certificat (DER), 64 caractères hexadécimaux minuscules. */
  fingerprint: string;
}

/**
 * Le certificat du serveur, créé au premier démarrage puis **jamais
 * régénéré** : l'app retient son empreinte, et un certificat neuf la
 * ferait passer pour un imposteur.
 *
 * Auto-signé : un serveur de maison n'a pas de nom de domaine à faire
 * certifier. L'app ne s'appuie donc pas sur une autorité, mais sur
 * l'empreinte — transmise par le QR code, ou comparée à l'œil.
 */
export function ensureCertificate(
  directory: string,
  names: string[],
  ips: string[],
): TlsMaterial {
  const keyPath = join(directory, 'tls-key.pem');
  const certPath = join(directory, 'tls-cert.pem');

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    mkdirSync(directory, { recursive: true });
    const san = [
      ...names.map((name) => `DNS:${name}`),
      ...ips.map((ip) => `IP:${ip}`),
    ].join(',');

    // openssl est dans l'image : pas de dépendance pour une opération
    // faite une fois dans la vie du serveur.
    const config = join(tmpdir(), `mh-tls-${process.pid}.cnf`);
    writeFileSync(
      config,
      [
        '[req]',
        'distinguished_name=dn',
        'x509_extensions=ext',
        'prompt=no',
        '[dn]',
        'CN=MyHousehold',
        '[ext]',
        `subjectAltName=${san}`,
        'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature',
        'extendedKeyUsage=serverAuth',
      ].join('\n'),
    );
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-days',
        '36500',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-config',
        config,
      ],
      { stdio: 'ignore' },
    );
  }

  const cert = readFileSync(certPath, 'utf8');
  return { key: readFileSync(keyPath, 'utf8'), cert, fingerprint: fingerprintOf(cert) };
}

export function fingerprintOf(certPem: string): string {
  return new X509Certificate(certPem).fingerprint256.replaceAll(':', '').toLowerCase();
}

/**
 * L'empreinte telle qu'on la compare à l'œil : les 24 premiers
 * caractères, en six groupes de quatre. 96 bits suffisent contre qui
 * voudrait fabriquer un certificat de même empreinte affichée ; l'app,
 * elle, compare toujours l'empreinte entière quand elle la connaît.
 */
export function displayFingerprint(fingerprint: string): string {
  return (fingerprint.slice(0, 24).toUpperCase().match(/.{4}/g) ?? []).join(' ');
}
