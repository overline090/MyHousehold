export const TASKS_QUEUE = 'tasks';

export const JobName = {
  /** Crée les occurrences manquantes sur la fenêtre glissante. */
  MATERIALIZE: 'tasks.materialize',
  /** Marque manquées les occurrences dépassées. */
  MARK_MISSED: 'tasks.markMissed',
  /** Regarde s'il existe une version plus récente du serveur et de l'app. */
  CHECK_RELEASES: 'releases.check',
} as const;

export type JobNameValue = (typeof JobName)[keyof typeof JobName];
