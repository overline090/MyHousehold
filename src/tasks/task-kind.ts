import { AssignmentMode, TaskKind } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/**
 * Champs propres à chaque façon d'être due. Les refuser plutôt que les
 * ignorer : une tâche de fond créée avec une récurrence, acceptée en
 * silence, ne se répéterait jamais et personne ne saurait pourquoi.
 */
const CHAMPS_PAR_TYPE: Record<TaskKind, readonly string[]> = {
  [TaskKind.SCHEDULED]: ['rrule', 'dueTime', 'graceHours', 'startsOn', 'endsOn'],
  [TaskKind.BACKGROUND]: ['maxIntervalSeconds', 'warnRatio'],
  [TaskKind.ONE_OFF]: ['dueDate'],
};

const LIBELLE: Record<TaskKind, string> = {
  [TaskKind.SCHEDULED]: 'récurrente',
  [TaskKind.BACKGROUND]: 'de fond',
  [TaskKind.ONE_OFF]: 'ponctuelle',
};

/** Les champs renseignés qui n'appartiennent pas à ce type de tâche. */
export function champsHorsType(
  kind: TaskKind,
  renseignes: Record<string, unknown>,
): string[] {
  const autorises = new Set(CHAMPS_PAR_TYPE[kind]);
  return Object.entries(renseignes)
    .filter(([, valeur]) => valeur !== undefined && valeur !== null)
    .map(([champ]) => champ)
    .filter(
      (champ) =>
        !autorises.has(champ) &&
        Object.values(CHAMPS_PAR_TYPE).some((champs) => champs.includes(champ)),
    );
}

export function assertChampsCoherents(
  kind: TaskKind,
  renseignes: Record<string, unknown>,
): void {
  const hors = champsHorsType(kind, renseignes);

  if (hors.length > 0) {
    throw AppException.badRequest(
      ErrorCode.FIELD_NOT_APPLICABLE,
      `Une tâche ${LIBELLE[kind]} n'a pas de ${hors.join(', ')}.`,
      { kind, fields: hors },
    );
  }
}

/**
 * Une tâche récurrente sans règle n'est due à aucun moment : elle
 * n'apparaîtrait jamais nulle part.
 */
export function assertRecurrenceRequise(kind: TaskKind, rrule: unknown): void {
  if (kind === TaskKind.SCHEDULED && !rrule) {
    throw AppException.badRequest(
      ErrorCode.INVALID_RECURRENCE,
      'Une tâche récurrente a besoin d’une règle de répétition.',
    );
  }
}

/**
 * Le tour de rôle suppose une suite d'échéances ; une tâche de fond
 * n'en a pas, et une tâche ponctuelle n'en a qu'une.
 */
export function assertRotationApplicable(kind: TaskKind, mode: AssignmentMode): void {
  if (mode === AssignmentMode.ROTATION && kind !== TaskKind.SCHEDULED) {
    throw AppException.badRequest(
      ErrorCode.INVALID_ASSIGNMENT,
      `Un tour de rôle suppose une suite d'échéances : une tâche ${LIBELLE[kind]} n'en a pas.`,
      { kind },
    );
  }
}
