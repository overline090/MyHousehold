/** Les jours d'un agenda : des dates locales « AAAA-MM-JJ », sans fuseau. */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function versDate(jour: string): Date {
  return new Date(`${jour}T12:00:00Z`);
}

export function decaler(jour: string, n: number): string {
  const d = versDate(jour);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function decalerMois(jour: string, n: number): string {
  const d = versDate(jour);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = dimanche … 6 = samedi */
export function jourDeLaSemaine(jour: string): number {
  return versDate(jour).getUTCDay();
}

/** Le premier jour de la semaine qui contient `jour` ; `debut` : 1 = lundi … 7 = dimanche. */
export function debutDeSemaine(jour: string, debut = 1): string {
  const d = jourDeLaSemaine(jour);
  const premier = debut % 7;
  return decaler(jour, -((d - premier + 7) % 7));
}

/** Les semaines affichées pour le mois de `jour` : du début de la semaine du 1er à la fin de celle du dernier. */
export function semainesDuMois(jour: string, debut = 1): string[][] {
  const premier = `${jour.slice(0, 7)}-01`;
  const dernier = decaler(decalerMois(premier, 1), -1);
  const semaines: string[][] = [];
  for (let lundi = debutDeSemaine(premier, debut); lundi <= dernier; lundi = decaler(lundi, 7)) {
    semaines.push(Array.from({ length: 7 }, (_, i) => decaler(lundi, i)));
  }
  return semaines;
}

export function moisEnClair(jour: string): string {
  const d = versDate(jour);
  const m = MOIS[d.getUTCMonth()];
  return `${m[0].toUpperCase()}${m.slice(1)} ${d.getUTCFullYear()}`;
}

export function jourEnClair(jour: string): string {
  const d = versDate(jour);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

export function enteteDeColonnes(debut = 1): string[] {
  return Array.from({ length: 7 }, (_, i) => JOURS[(debut + i) % 7].slice(0, 3));
}

/** Un jour et une heure locaux en instant ISO (le navigateur est réputé dans le fuseau du foyer). */
export function versInstant(jour: string, heure: string): string {
  return new Date(`${jour}T${heure || '00:00'}:00`).toISOString();
}

export function heureLocale(iso: string, fuseau: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Une occurrence de rendez-vous, telle que GET /appointments la rend. */
export interface Instance {
  appointmentId: string;
  title: string;
  location: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  isRecurring: boolean;
  visibility: 'HOUSEHOLD' | 'PRIVATE';
  attendees: { id: string; firstName: string; lastName: string }[];
}
