/**
 * État dérivé d'un compteur. Jamais stocké : un événement peut être
 * ajouté dans le passé ou supprimé, ce qui invaliderait n'importe quel
 * champ mis en cache. Le coût est négligeable — un `max()` sur un index.
 */
export const CounterStatus = {
  /** Aucun événement : l'action n'a jamais été faite. */
  NEVER_DONE: 'NEVER_DONE',
  OK: 'OK',
  DUE_SOON: 'DUE_SOON',
  OVERDUE: 'OVERDUE',
} as const;

export type CounterStatusValue = (typeof CounterStatus)[keyof typeof CounterStatus];

export interface CounterState {
  status: CounterStatusValue;
  /** Temps écoulé depuis la dernière fois, en secondes. */
  elapsedSeconds: number | null;
  /** Quand il faudra refaire l'action. `null` si le compteur n'a pas de cible. */
  nextDueAt: Date | null;
}

export function deriveCounterState(params: {
  lastEventAt: Date | null;
  /** `null` = compteur purement informatif : il ne fait que compter. */
  targetIntervalSeconds: number | null;
  /** Fraction de l'intervalle à partir de laquelle on prévient. */
  warnRatio: number;
  now: Date;
}): CounterState {
  const { lastEventAt, targetIntervalSeconds, warnRatio, now } = params;

  if (!lastEventAt) {
    return { status: CounterStatus.NEVER_DONE, elapsedSeconds: null, nextDueAt: null };
  }

  // Un événement peut être déclaré dans le passé, jamais dans le futur ;
  // par prudence, un écoulement négatif est ramené à zéro plutôt que
  // d'afficher « il y a -3 jours ».
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - lastEventAt.getTime()) / 1000),
  );

  if (targetIntervalSeconds === null) {
    return { status: CounterStatus.OK, elapsedSeconds, nextDueAt: null };
  }

  const nextDueAt = new Date(lastEventAt.getTime() + targetIntervalSeconds * 1000);
  const warnAfter = targetIntervalSeconds * warnRatio;

  const status =
    elapsedSeconds >= targetIntervalSeconds
      ? CounterStatus.OVERDUE
      : elapsedSeconds >= warnAfter
        ? CounterStatus.DUE_SOON
        : CounterStatus.OK;

  return { status, elapsedSeconds, nextDueAt };
}
