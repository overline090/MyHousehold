/**
 * Ce que la page Tâches dit d'une tâche : sa règle en clair, et les
 * prochaines fois — calculées ici pour que l'aperçu suive la saisie,
 * avant même d'enregistrer.
 */

export type Jour = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type Repetition =
  | { form: 'DAILY'; interval?: number }
  | { form: 'WEEKDAYS'; days: Jour[] }
  | { form: 'MONTH_DAYS'; days: number[] }
  | { form: 'YEAR_DATES'; dates: string[] }
  | { form: 'EVERY_N'; unit: 'WEEK' | 'MONTH'; interval: number };

export const JOURS: Jour[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const JOURS_COURTS: Record<Jour, string> = { MO: 'L', TU: 'M', WE: 'M', TH: 'J', FR: 'V', SA: 'S', SU: 'D' };
const JOURS_LONGS: Record<Jour, string> = {
  MO: 'lundi',
  TU: 'mardi',
  WE: 'mercredi',
  TH: 'jeudi',
  FR: 'vendredi',
  SA: 'samedi',
  SU: 'dimanche',
};
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

// ── Dates locales « AAAA-MM-JJ », sans fuseau : des jours, pas des instants ──

function versDate(jour: string): Date {
  return new Date(`${jour}T12:00:00Z`);
}

function versJour(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function decaler(jour: string, jours: number): string {
  const d = versDate(jour);
  d.setUTCDate(d.getUTCDate() + jours);
  return versJour(d);
}

export function ecartEnJours(de: string, a: string): number {
  return Math.round((versDate(a).getTime() - versDate(de).getTime()) / 86_400_000);
}

function jourDeLaSemaine(jour: string): Jour {
  return JOURS[(versDate(jour).getUTCDay() + 6) % 7];
}

function dernierJourDuMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
}

/** Lundi 3 novembre ; avec l'année si elle n'est pas celle de `reference`. */
export function dateEnClair(jour: string, reference?: string): string {
  const d = versDate(jour);
  const nom = JOURS_LONGS[jourDeLaSemaine(jour)];
  const texte = `${nom[0].toUpperCase()}${nom.slice(1)} ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
  return reference && reference.slice(0, 4) !== jour.slice(0, 4) ? `${texte} ${d.getUTCFullYear()}` : texte;
}

function dateCourte(jour: string): string {
  const d = versDate(jour);
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

function liste(mots: string[]): string {
  return mots.length <= 1 ? (mots[0] ?? '') : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
}

export function heureCourte(heure: string | null | undefined): string | null {
  if (!heure) return null;
  const [h, m] = heure.split(':');
  return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

/** « Tous les 3 jours, 19 h », « Chaque lundi et jeudi »… */
export function repetitionEnClair(r: Repetition | null, heure?: string | null): string {
  const h = heureCourte(heure);
  const avecHeure = (texte: string) => (h ? `${texte}, ${h}` : texte);
  if (!r) return avecHeure('Règle personnalisée');
  switch (r.form) {
    case 'DAILY': {
      const n = r.interval ?? 1;
      return avecHeure(n === 1 ? 'Chaque jour' : n === 2 ? 'Un jour sur deux' : `Tous les ${n} jours`);
    }
    case 'WEEKDAYS': {
      const jours = JOURS.filter((j) => r.days.includes(j));
      if (jours.length === 7) return avecHeure('Chaque jour');
      if (jours.length === 5 && !jours.includes('SA') && !jours.includes('SU')) return avecHeure('En semaine');
      return avecHeure(`Chaque ${liste(jours.map((j) => JOURS_LONGS[j]))}`);
    }
    case 'MONTH_DAYS': {
      const jours = [...r.days].sort((a, b) => (a === -1 ? 99 : a) - (b === -1 ? 99 : b));
      const mots = jours.map((j) => (j === -1 ? (jours.length > 1 ? 'le dernier jour' : 'dernier jour') : j === 1 ? '1er' : String(j)));
      return avecHeure(`Le ${liste(mots)} du mois`);
    }
    case 'YEAR_DATES':
      return avecHeure(`Le ${liste(r.dates.map((d) => dateCourte(`2000-${d}`)))}`);
    case 'EVERY_N':
      return avecHeure(
        r.unit === 'WEEK'
          ? r.interval === 1
            ? 'Chaque semaine'
            : `Toutes les ${r.interval} semaines`
          : r.interval === 1
            ? 'Chaque mois'
            : `Tous les ${r.interval} mois`,
      );
  }
}

/** Ce jour est-il dans la série qui commence le `premier` jour ? */
function dansLaSerie(r: Repetition, premier: string, jour: string): boolean {
  const d = versDate(jour);
  const p = versDate(premier);
  switch (r.form) {
    case 'DAILY':
      return ecartEnJours(premier, jour) % (r.interval ?? 1) === 0;
    case 'WEEKDAYS':
      return r.days.includes(jourDeLaSemaine(jour));
    case 'MONTH_DAYS': {
      const dernier = dernierJourDuMois(d.getUTCFullYear(), d.getUTCMonth());
      return r.days.some((j) => (j === -1 ? d.getUTCDate() === dernier : j === d.getUTCDate()));
    }
    case 'YEAR_DATES':
      return r.dates.includes(jour.slice(5));
    case 'EVERY_N':
      if (r.unit === 'WEEK') {
        const ecart = ecartEnJours(premier, jour);
        return ecart % (7 * r.interval) === 0;
      } else {
        const mois = (d.getUTCFullYear() - p.getUTCFullYear()) * 12 + d.getUTCMonth() - p.getUTCMonth();
        return mois % r.interval === 0 && d.getUTCDate() === p.getUTCDate();
      }
  }
}

/**
 * Les `combien` prochaines dates de la série à partir de `depuis`, avec
 * leur rang dans la série — c'est le rang qui décide du tour, compté
 * depuis le premier jour comme le fait le serveur.
 */
export function prochainesFois(
  r: Repetition | null,
  premier: string,
  depuis: string,
  combien = 3,
): { jour: string; rang: number }[] {
  if (!r) return [];
  const resultat: { jour: string; rang: number }[] = [];
  let rang = 0;
  // Trois ans suffisent à trouver trois dates, même « le 29 février ».
  for (let i = 0, jour = premier; i < 366 * 5 && resultat.length < combien; i++, jour = decaler(jour, 1)) {
    if (!dansLaSerie(r, premier, jour)) continue;
    if (jour >= depuis) resultat.push({ jour, rang });
    rang++;
  }
  return resultat;
}

/** « Aujourd'hui, 19 h », « Demain », « Dans 5 jours », « 15 avril », « En retard de 2 jours ». */
export function prochaineFoisEnClair(jour: string, aujourdHui: string, heure?: string | null): string {
  const n = ecartEnJours(aujourdHui, jour);
  const h = heureCourte(heure);
  if (n < 0) return n === -1 ? 'En retard d’un jour' : `En retard de ${-n} jours`;
  const texte = n === 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : n < 7 ? `Dans ${n} jours` : dateCourte(jour);
  return h ? `${texte}, ${h}` : texte;
}
