import { DateTime } from 'luxon';
import { Frequency, RRule } from 'rrule';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/** Jour pur, en heure locale du foyer : `YYYY-MM-DD`. */
export type LocalDate = string;

export interface SeriesOptions {
  /** RRULE RFC 5545 sans le préfixe `RRULE:`, ex. `FREQ=WEEKLY;BYDAY=MO`. */
  rrule: string;
  /** Fuseau du foyer. C'est lui qui fait référence, pas celui du serveur. */
  timezone: string;
  /** Premier jour possible de la série. */
  seriesStart: LocalDate;
  /** Dernier jour possible, borne incluse. */
  seriesEnd?: LocalDate | null;
  /** Heure locale d'échéance `HH:mm`. `null` = toute la journée. */
  dueTime?: string | null;
}

export interface GeneratedOccurrence {
  scheduledFor: LocalDate;
  /** Instant UTC de l'échéance, calculé dans le fuseau du foyer. */
  dueAt: Date;
  /**
   * Position dans la série depuis `seriesStart`, à partir de 0.
   *
   * C'est ce qui rend le tour de rôle déterministe : l'assignation d'une
   * occurrence se déduit de sa position, et non d'un compteur que l'on
   * incrémente. Regénérer la série redonne donc exactement les mêmes
   * assignations, même après suppression d'une occurrence future.
   */
  ordinal: number;
}

/**
 * Garde-fou : une tâche de foyer ne se répète pas plus souvent qu'une
 * fois par jour. Au-delà, une seule règle pourrait générer des millions
 * d'occurrences et saturer la base.
 */
const ALLOWED_FREQUENCIES = new Set<Frequency>([
  RRule.YEARLY,
  RRule.MONTHLY,
  RRule.WEEKLY,
  RRule.DAILY,
]);

/** Plafond de sécurité sur la longueur d'une série déroulée. */
const MAX_SERIES_LENGTH = 20_000;

export function assertValidRrule(rrule: string): void {
  let options;
  try {
    options = RRule.parseString(rrule);
  } catch {
    throw AppException.badRequest(
      ErrorCode.INVALID_RRULE,
      "La règle de récurrence n'est pas lisible.",
      { rrule },
    );
  }

  if (options.freq === undefined || !ALLOWED_FREQUENCIES.has(options.freq)) {
    throw AppException.badRequest(
      ErrorCode.INVALID_RRULE,
      'Une tâche se répète au maximum une fois par jour (FREQ=DAILY, WEEKLY, MONTHLY ou YEARLY).',
      { rrule },
    );
  }

  // RFC 5545 : COUNT et UNTIL s'excluent. Les accepter ensemble donnerait
  // une fin de série dépendante de l'implémentation.
  if (options.count != null && options.until != null) {
    throw AppException.badRequest(
      ErrorCode.INVALID_RRULE,
      'COUNT et UNTIL ne peuvent pas être utilisés ensemble.',
      { rrule },
    );
  }

  if (options.interval != null && (options.interval < 1 || options.interval > 366)) {
    throw AppException.badRequest(
      ErrorCode.INVALID_RRULE,
      "L'intervalle doit être compris entre 1 et 366.",
      { rrule },
    );
  }
}

/**
 * Déroule la série dans la fenêtre demandée.
 *
 * La règle est déroulée **en heure locale du foyer** puis convertie en
 * instants UTC, jamais l'inverse : « chaque lundi à 19 h » doit rester
 * 19 h locales de part et d'autre d'un changement d'heure. La
 * bibliothèque rrule travaille sur des dates naïves, qu'on interprète
 * ici comme des jours locaux.
 */
export function generateOccurrences(
  options: SeriesOptions,
  windowStart: LocalDate,
  windowEnd: LocalDate,
): GeneratedOccurrence[] {
  assertValidRrule(options.rrule);

  const start = laterOf(options.seriesStart, windowStart);
  const end = options.seriesEnd ? earlierOf(options.seriesEnd, windowEnd) : windowEnd;
  if (start > end) {
    return [];
  }

  const rule = new RRule({
    ...RRule.parseString(options.rrule),
    dtstart: naiveUtc(options.seriesStart),
  });

  // Déroulé depuis le début de la série, et non depuis la fenêtre : la
  // position d'une occurrence dans la série détermine son assignation,
  // elle doit donc être comptée depuis le premier jour.
  const all = rule.between(
    naiveUtc(options.seriesStart),
    naiveUtc(end),
    true,
    (_date, index) => index < MAX_SERIES_LENGTH,
  );

  const result: GeneratedOccurrence[] = [];
  all.forEach((date, ordinal) => {
    const scheduledFor = localDateOf(date);
    if (scheduledFor < start || scheduledFor > end) {
      return;
    }
    result.push({
      scheduledFor,
      dueAt: dueInstant(scheduledFor, options.dueTime ?? null, options.timezone),
      ordinal,
    });
  });

  return result;
}

/**
 * Instant d'échéance d'un jour donné.
 *
 * Sans heure précisée, l'échéance est la fin de la journée locale : une
 * tâche « du lundi » n'est pas en retard à 00 h 01 le lundi.
 *
 * Deux cas limites assumés, propres aux changements d'heure :
 * - heure inexistante (passage à l'heure d'été, 02:30 le jour où
 *   02:00 devient 03:00) : l'échéance est reportée après le saut ;
 * - heure ambiguë (passage à l'heure d'hiver, 02:30 qui a lieu deux
 *   fois) : la première est retenue.
 *
 * Dans les deux cas on obtient un instant valide, ce qui vaut mieux
 * qu'une échéance absente ou dupliquée.
 */
export function dueInstant(
  scheduledFor: LocalDate,
  dueTime: string | null,
  timezone: string,
): Date {
  const [year, month, day] = scheduledFor.split('-').map(Number);

  if (!dueTime) {
    const endOfDay = DateTime.fromObject({ year, month, day }, { zone: timezone }).endOf(
      'day',
    );
    return endOfDay.toUTC().toJSDate();
  }

  const [hour, minute] = dueTime.split(':').map(Number);
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: timezone })
    .toUTC()
    .toJSDate();
}

/** Jour courant dans le fuseau du foyer. */
export function todayIn(timezone: string, now: Date): LocalDate {
  return DateTime.fromJSDate(now).setZone(timezone).toISODate() as LocalDate;
}

/** Décale un jour local d'un nombre de jours. */
export function shiftDays(date: LocalDate, days: number): LocalDate {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate() as LocalDate;
}

/**
 * Minuit UTC du jour donné. rrule raisonne sur des dates naïves : on lui
 * fournit des jours « hors fuseau », et l'interprétation locale se fait
 * au moment du calcul de l'échéance.
 */
function naiveUtc(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function localDateOf(naive: Date): LocalDate {
  return naive.toISOString().slice(0, 10);
}

function laterOf(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
}

function earlierOf(a: LocalDate, b: LocalDate): LocalDate {
  return a < b ? a : b;
}
