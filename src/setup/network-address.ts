/**
 * L'assistant d'installation est, par définition, non authentifié :
 * aucun compte n'existe encore. Qui l'atteint le premier devient
 * administrateur du foyer. Première protection : n'accepter que des
 * adresses du réseau local.
 */
export function isPrivateAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  // Express rend parfois une adresse IPv4 encapsulée en IPv6.
  const addr = address.replace(/^::ffff:/i, '').toLowerCase();

  if (addr === '::1' || addr === '127.0.0.1' || addr === 'localhost') {
    return true;
  }

  if (/^[0-9.]+$/.test(addr)) {
    const parts = addr.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return false;
    }
    const [a, b] = parts;
    return (
      a === 10 || // 10.0.0.0/8
      a === 127 || // boucle locale
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) // lien-local, dont le point d'accès du Pi
    );
  }

  // IPv6 : adresses uniques locales (fc00::/7) et lien-local (fe80::/10).
  return /^f[cd][0-9a-f]{2}:/.test(addr) || /^fe[89ab][0-9a-f]:/.test(addr);
}

/**
 * Derrière un reverse proxy, l'adresse vue par le serveur est celle du
 * proxy — souvent privée — et la protection ci-dessus ne veut plus rien
 * dire. On le détecte à la présence d'un en-tête de transfert, et on
 * exige alors le jeton d'installation plutôt que de laisser passer en
 * silence.
 */
export function looksProxied(headers: Record<string, unknown>): boolean {
  return Boolean(
    headers['x-forwarded-for'] ??
    headers['x-real-ip'] ??
    headers['forwarded'] ??
    headers['x-forwarded-host'],
  );
}
