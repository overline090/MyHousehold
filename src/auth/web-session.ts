import type { Request, Response } from 'express';

/**
 * La session du navigateur.
 *
 * L'app garde son jeton de renouvellement dans son stockage privé ; un
 * navigateur n'a pas d'endroit aussi sûr. Le jeton y vit donc dans un
 * cookie `HttpOnly` qu'aucun script ne peut lire, limité aux routes
 * d'authentification. Le jeton d'accès, lui, reste en mémoire de la page.
 *
 * Le navigateur s'annonce par l'en-tête `X-MH-Client: web` ; sans lui,
 * rien ne change pour l'app.
 */
export const COOKIE_RENOUVELLEMENT = 'mh_refresh';
const CHEMIN = '/api/v1/auth';

export function estNavigateur(request: Request): boolean {
  return request.headers['x-mh-client'] === 'web';
}

export function poserCookie(
  request: Request,
  response: Response,
  jeton: string,
  dureeSecondes: number,
): void {
  response.cookie(COOKIE_RENOUVELLEMENT, jeton, {
    httpOnly: true,
    // Sur le réseau de la maison en HTTPS, ou derrière un reverse proxy :
    // le cookie ne part jamais en clair. En HTTP sur la machine elle-même
    // (développement, 127.0.0.1), il le faut bien.
    secure: request.secure || request.headers['x-forwarded-proto'] === 'https',
    sameSite: 'strict',
    path: CHEMIN,
    maxAge: dureeSecondes * 1000,
  });
}

export function effacerCookie(response: Response): void {
  response.clearCookie(COOKIE_RENOUVELLEMENT, { path: CHEMIN });
}

/** Lu à la main : une dépendance pour un seul cookie n'en vaut pas la peine. */
export function lireCookie(request: Request): string | undefined {
  const brut = request.headers.cookie;
  if (!brut) return undefined;
  for (const morceau of brut.split(';')) {
    const [nom, ...valeur] = morceau.trim().split('=');
    if (nom === COOKIE_RENOUVELLEMENT) {
      return decodeURIComponent(valeur.join('='));
    }
  }
  return undefined;
}
