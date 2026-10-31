import { ApiError, request } from './api';

/**
 * La session du navigateur.
 *
 * Le jeton d'accès vit en mémoire de la page, et nulle part ailleurs ; le
 * jeton de renouvellement est dans un cookie `HttpOnly` que le serveur
 * pose et qu'aucun script ne lit. Recharger la page relance donc la
 * session par ce cookie, sans redemander le mot de passe.
 */

export interface Utilisateur {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  avatarUrl: string | null;
  status: { id: string; name: string };
  rights: string[];
}

export interface Foyer {
  id: string;
  name: string;
  timezone: string;
  weekStartsOn?: number;
}

export const session = $state<{ utilisateur: Utilisateur | null; foyer: Foyer | null; prete: boolean }>({
  utilisateur: null,
  foyer: null,
  prete: false,
});

const NAVIGATEUR = { 'x-mh-client': 'web' };
let jeton: string | null = null;
let renouvellement: Promise<boolean> | null = null;

/** Un seul renouvellement à la fois : dix requêtes expirées ensemble n'en font qu'un. */
export function renouveler(): Promise<boolean> {
  renouvellement ??= (async () => {
    try {
      const reponse = await request<{ accessToken: string }>('/api/v1/auth/refresh', {
        method: 'POST',
        headers: NAVIGATEUR,
        body: '{}',
      });
      jeton = reponse.accessToken;
      return true;
    } catch {
      jeton = null;
      return false;
    } finally {
      renouvellement = null;
    }
  })();
  return renouvellement;
}

/** Un appel à l'API, avec le jeton d'accès ; une seule nouvelle tentative s'il a expiré. */
export async function api<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const appeler = () =>
    request<T>(`/api/v1${chemin}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    });
  try {
    return await appeler();
  } catch (erreur) {
    if (!(erreur instanceof ApiError) || erreur.status !== 401) throw erreur;
    if (!(await renouveler())) {
      session.utilisateur = null;
      throw erreur;
    }
    return appeler();
  }
}

/**
 * Une image protégée (photo de profil) : une balise <img> n'envoie pas le
 * jeton, on la charge donc ici et on la rend en adresse locale.
 */
export async function imageProtegee(chemin: string): Promise<string | null> {
  const charger = () =>
    fetch(chemin, { headers: jeton ? { authorization: `Bearer ${jeton}` } : {} });
  let reponse = await charger();
  if (reponse.status === 401 && (await renouveler())) reponse = await charger();
  return reponse.ok ? URL.createObjectURL(await reponse.blob()) : null;
}

export async function seConnecter(identifiant: string, motDePasse: string): Promise<void> {
  const reponse = await request<{ accessToken: string; user: Utilisateur; household: Foyer }>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: NAVIGATEUR,
      body: JSON.stringify({
        username: identifiant.trim().toLowerCase(),
        password: motDePasse,
        deviceName: navigateurEnClair(),
      }),
    },
  );
  jeton = reponse.accessToken;
  session.utilisateur = reponse.user;
  session.foyer = reponse.household;
}

/** À l'ouverture de la page : la session reprend si le cookie est encore valable. */
export async function restaurer(): Promise<void> {
  try {
    if (await renouveler()) {
      const moi = await api<{ user: Utilisateur; household: Foyer }>('/auth/me');
      session.utilisateur = moi.user;
      session.foyer = moi.household;
    }
  } finally {
    session.prete = true;
  }
}

export async function seDeconnecter(): Promise<void> {
  try {
    await request('/api/v1/auth/logout', { method: 'POST', headers: NAVIGATEUR, body: '{}' });
  } finally {
    jeton = null;
    session.utilisateur = null;
  }
}

export function aLeDroit(droit: string): boolean {
  return session.utilisateur?.rights.includes(droit) ?? false;
}

/** Ce que « Mes appareils » affichera : « Firefox sur Linux ». */
function navigateurEnClair(): string {
  const ua = navigator.userAgent;
  const nom = /Firefox\//.test(ua)
    ? 'Firefox'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navigateur';
  const systeme = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return systeme ? `${nom} sur ${systeme}` : nom;
}
