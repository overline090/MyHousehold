/**
 * Ce qu'encode le QR code du serveur, lu par l'app :
 *
 *   myhousehold://serveur?adresse=https://192.168.1.20:3443&empreinte=<sha-256>&code=K7MP-4RQX
 *
 * L'empreinte y est entière : avec le QR code, l'app vérifie le
 * serveur sans rien demander. Le code d'appariement est facultatif —
 * absent, le lien sert seulement à trouver le serveur.
 */
export function buildServerLink(params: {
  address: string;
  fingerprint: string;
  code?: string;
}): string {
  const query = new URLSearchParams({
    adresse: params.address,
    empreinte: params.fingerprint,
  });
  if (params.code) {
    query.set('code', params.code);
  }
  return `myhousehold://serveur?${query.toString()}`;
}
