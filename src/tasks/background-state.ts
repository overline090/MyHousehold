/**
 * État dérivé d'une tâche de fond — une tâche sans date, à refaire dans
 * un délai. Jamais stocké : une complétion peut être déclarée dans le
 * passé ou corrigée, ce qui invaliderait n'importe quel champ mis en
 * cache. Le coût est négligeable — un `max()` sur un index.
 */
export const BackgroundState = {
  /** Aucune complétion : l'action n'a jamais été faite. */
  NEVER_DONE: 'NEVER_DONE',
  OK: 'OK',
  DUE_SOON: 'DUE_SOON',
  OVERDUE: 'OVERDUE',
} as const;

export type BackgroundStateValue = (typeof BackgroundState)[keyof typeof BackgroundState];

export interface BackgroundStateInfo {
  status: BackgroundStateValue;
  /** Temps écoulé depuis la dernière fois, en secondes. */
  elapsedSeconds: number | null;
  /** Quand il faudra refaire l'action. `null` sans délai imparti. */
  nextDueAt: Date | null;
}

export function deriveBackgroundState(params: {
  lastDoneAt: Date | null;
  /** `null` = pas de délai imparti : la tâche ne fait que compter le temps. */
  maxIntervalSeconds: number | null;
  /** Fraction de l'intervalle à partir de laquelle on prévient. */
  warnRatio: number;
  now: Date;
}): BackgroundStateInfo {
  const { lastDoneAt, maxIntervalSeconds, warnRatio, now } = params;

  if (!lastDoneAt) {
    return { status: BackgroundState.NEVER_DONE, elapsedSeconds: null, nextDueAt: null };
  }

  // Une complétion peut être déclarée dans le passé, jamais dans le
  // futur ; par prudence, un écoulement négatif est ramené à zéro plutôt
  // que d'afficher « il y a -3 jours ».
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - lastDoneAt.getTime()) / 1000),
  );

  if (maxIntervalSeconds === null) {
    return { status: BackgroundState.OK, elapsedSeconds, nextDueAt: null };
  }

  const nextDueAt = new Date(lastDoneAt.getTime() + maxIntervalSeconds * 1000);
  const warnAfter = maxIntervalSeconds * warnRatio;

  const status =
    elapsedSeconds >= maxIntervalSeconds
      ? BackgroundState.OVERDUE
      : elapsedSeconds >= warnAfter
        ? BackgroundState.DUE_SOON
        : BackgroundState.OK;

  return { status, elapsedSeconds, nextDueAt };
}
