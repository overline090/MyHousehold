import { RRule, Weekday } from 'rrule';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/**
 * Les cinq façons dont un foyer formule une répétition — et pas
 * davantage. L'interface ne montre jamais une RRULE : elle propose ces
 * cinq formes, et affiche les trois prochaines dates, parce que personne
 * ne vérifie une règle dans l'abstrait alors que tout le monde vérifie
 * trois dates.
 *
 * La RRULE reste le format de stockage : c'est un standard, déjà compris
 * par le moteur du serveur et par les agendas. Ces formes en sont une
 * façade, pas un remplacement — un client qui sait ce qu'il fait peut
 * toujours envoyer la règle brute.
 */
export type RecurrenceForm =
  /** Tous les jours, ou tous les N jours. */
  | { form: 'DAILY'; interval?: number }
  /** Jours choisis de la semaine : lundi et jeudi. */
  | { form: 'WEEKDAYS'; days: Weekdays[] }
  /** Dates choisies du mois : le 1er, le 15, ou le dernier jour (−1). */
  | { form: 'MONTH_DAYS'; days: number[] }
  /** Dates choisies de l'année, en `MM-DD`. */
  | { form: 'YEAR_DATES'; dates: string[] }
  /** Toutes les N semaines, ou tous les N mois. */
  | { form: 'EVERY_N'; unit: 'WEEK' | 'MONTH'; interval: number };

export type Weekdays = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

const JOURS: Record<Weekdays, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

const PAR_INDICE: Weekdays[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function refuser(message: string, details?: Record<string, unknown>): never {
  throw AppException.badRequest(ErrorCode.INVALID_RECURRENCE, message, details);
}

/** Traduit une forme en RRULE RFC 5545, sans le préfixe `RRULE:`. */
export function formToRrule(recurrence: RecurrenceForm): string {
  switch (recurrence.form) {
    case 'DAILY': {
      const interval = recurrence.interval ?? 1;
      assertIntervalle(interval);
      return interval === 1 ? 'FREQ=DAILY' : `FREQ=DAILY;INTERVAL=${interval}`;
    }

    case 'WEEKDAYS': {
      if (recurrence.days.length === 0) {
        refuser('Choisissez au moins un jour de la semaine.');
      }
      const jours = [...new Set(recurrence.days)]
        .sort((a, b) => PAR_INDICE.indexOf(a) - PAR_INDICE.indexOf(b))
        .map((jour) => JOURS[jour].toString());
      return `FREQ=WEEKLY;BYDAY=${jours.join(',')}`;
    }

    case 'MONTH_DAYS': {
      if (recurrence.days.length === 0) {
        refuser('Choisissez au moins une date du mois.');
      }
      for (const jour of recurrence.days) {
        // −1 vaut « dernier jour du mois » : le 31 n'existe pas partout,
        // et une règle posée un 31 sauterait février.
        if (jour === 0 || jour < -1 || jour > 31) {
          refuser('Une date du mois va de 1 à 31, ou vaut −1 pour le dernier jour.', {
            day: jour,
          });
        }
      }
      const jours = [...new Set(recurrence.days)].sort((a, b) => a - b);
      return `FREQ=MONTHLY;BYMONTHDAY=${jours.join(',')}`;
    }

    case 'YEAR_DATES': {
      if (recurrence.dates.length === 0) {
        refuser('Choisissez au moins une date dans l’année.');
      }
      const mois = new Set<number>();
      const jours = new Set<number>();

      for (const date of recurrence.dates) {
        const correspondance = /^(\d{2})-(\d{2})$/.exec(date);
        if (!correspondance) {
          refuser('Une date annuelle s’écrit MM-JJ.', { date });
        }
        const mm = Number(correspondance[1]);
        const jj = Number(correspondance[2]);
        if (mm < 1 || mm > 12 || jj < 1 || jj > 31) {
          refuser('Cette date n’existe pas.', { date });
        }
        mois.add(mm);
        jours.add(jj);
      }

      // Plusieurs dates dans la même règle ne tiennent que si elles
      // partagent le jour ou le mois : BYMONTH × BYMONTHDAY est un
      // produit, pas une liste de couples. « Le 15 mars et le 2 juin »
      // donnerait aussi le 2 mars et le 15 juin.
      if (mois.size > 1 && jours.size > 1) {
        refuser(
          'Ces dates ne tiennent pas dans une seule règle. Créez une tâche par date.',
          { dates: recurrence.dates },
        );
      }

      const parMois = [...mois].sort((a, b) => a - b).join(',');
      const parJour = [...jours].sort((a, b) => a - b).join(',');
      return `FREQ=YEARLY;BYMONTH=${parMois};BYMONTHDAY=${parJour}`;
    }

    case 'EVERY_N': {
      assertIntervalle(recurrence.interval);
      const freq = recurrence.unit === 'WEEK' ? 'WEEKLY' : 'MONTHLY';
      return `FREQ=${freq};INTERVAL=${recurrence.interval}`;
    }
  }
}

/**
 * Relit une RRULE comme l'une des cinq formes, ou rend `null` quand elle
 * sort de ce que l'interface sait montrer. Rendre `null` plutôt que
 * d'approximer : une règle affichée de travers est pire qu'une règle
 * affichée telle quelle.
 */
export function rruleToForm(rrule: string): RecurrenceForm | null {
  let options;
  try {
    options = RRule.parseString(rrule);
  } catch {
    return null;
  }

  const interval = options.interval ?? 1;
  const jours = options.byweekday;
  const joursDuMois = normaliser(options.bymonthday);
  const mois = normaliser(options.bymonth);

  // Tout ce qui sort du vocabulaire des cinq formes rend la règle
  // inclassable : COUNT, UNTIL, BYSETPOS, semaines de l'année…
  if (options.count || options.until || options.bysetpos || options.byweekno) {
    return null;
  }

  switch (options.freq) {
    case RRule.DAILY:
      if (jours || joursDuMois.length > 0 || mois.length > 0) return null;
      return { form: 'DAILY', interval };

    case RRule.WEEKLY: {
      if (joursDuMois.length > 0 || mois.length > 0) return null;
      if (!jours) {
        return { form: 'EVERY_N', unit: 'WEEK', interval };
      }
      if (interval !== 1) return null;
      const liste = Array.isArray(jours) ? jours : [jours];
      const noms = liste.map((jour) => PAR_INDICE[indiceDe(jour)]).filter(Boolean);
      return noms.length === liste.length ? { form: 'WEEKDAYS', days: noms } : null;
    }

    case RRule.MONTHLY: {
      if (jours) return null;
      if (joursDuMois.length === 0) {
        return { form: 'EVERY_N', unit: 'MONTH', interval };
      }
      if (interval !== 1 || mois.length > 0) return null;
      return { form: 'MONTH_DAYS', days: joursDuMois };
    }

    case RRule.YEARLY: {
      if (jours || interval !== 1 || mois.length === 0 || joursDuMois.length === 0) {
        return null;
      }
      if (mois.length > 1 && joursDuMois.length > 1) return null;
      const dates = mois.flatMap((mm) =>
        joursDuMois.map(
          (jj) => `${String(mm).padStart(2, '0')}-${String(jj).padStart(2, '0')}`,
        ),
      );
      return { form: 'YEAR_DATES', dates };
    }

    default:
      return null;
  }
}

function assertIntervalle(interval: number): void {
  if (!Number.isInteger(interval) || interval < 1 || interval > 366) {
    refuser('Un intervalle va de 1 à 366.', { interval });
  }
}

function normaliser(valeur: number | number[] | null | undefined): number[] {
  if (valeur === null || valeur === undefined) return [];
  return Array.isArray(valeur) ? valeur : [valeur];
}

/** rrule rend un jour tantôt en entier, tantôt en objet, tantôt en texte. */
function indiceDe(jour: number | string | Weekday): number {
  if (typeof jour === 'number') return jour;
  if (typeof jour === 'string') return PAR_INDICE.indexOf(jour.toUpperCase() as Weekdays);
  return jour.weekday;
}
