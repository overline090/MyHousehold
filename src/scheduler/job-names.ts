export const TASKS_QUEUE = 'tasks';

export const JobName = {
  /** Crée les occurrences manquantes sur la fenêtre glissante. */
  MATERIALIZE: 'tasks.materialize',
  /** Marque manquées les occurrences dépassées. */
  MARK_MISSED: 'tasks.markMissed',
} as const;

export type JobNameValue = (typeof JobName)[keyof typeof JobName];
