import { api } from '../../lib/session.svelte';
import type { Membre } from '../accueil/donnees';
import type { Repetition } from './regles';

export type Sorte = 'SCHEDULED' | 'BACKGROUND' | 'ONE_OFF';
export type ModeQui = 'ANYONE' | 'FIXED' | 'ROTATION';

export interface Groupe {
  id: string;
  name: string;
  color: string;
}

/** Une tâche telle que le serveur la décrit, tous types confondus. */
export interface Tache {
  id: string;
  title: string;
  description: string | null;
  kind: Sorte;
  priority: number;
  recurrence: Repetition | null;
  rrule: string | null;
  dueTime: string | null;
  maxIntervalSeconds: number | null;
  warnRatio: number;
  dueDate: string | null;
  assignmentMode: ModeQui;
  assignees: string[];
  isActive: boolean;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  group: Groupe | null;
  lastDoneAt?: string | null;
  elapsedSeconds?: number | null;
  state?: 'NEVER_DONE' | 'OK' | 'DUE_SOON' | 'OVERDUE';
  nextDueAt?: string | null;
}

export interface Echeance {
  id: string;
  taskId: string;
  scheduledFor: string | null;
  dueAt: string | null;
  status: 'PENDING' | 'DONE' | 'SKIPPED' | 'MISSED';
}

export interface PageTaches {
  taches: Tache[];
  groupes: Groupe[];
  membres: Map<string, Membre>;
  /** La prochaine échéance en attente de chaque tâche datée. */
  prochaines: Map<string, Echeance>;
}

export async function chargerTaches(aujourdHui: string, decaler: (j: string, n: number) => string): Promise<PageTaches> {
  const [taches, groupes, membres, echeances] = await Promise.all([
    api<Tache[]>('/tasks'),
    api<Groupe[]>('/task-groups'),
    api<Membre[]>('/members'),
    api<{ data: Echeance[] }>(
      `/occurrences?from=${decaler(aujourdHui, -30)}&to=${decaler(aujourdHui, 120)}&status=PENDING&limit=500`,
    ),
  ]);
  const prochaines = new Map<string, Echeance>();
  for (const e of [...echeances.data].sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))) {
    if (!prochaines.has(e.taskId)) prochaines.set(e.taskId, e);
  }
  return { taches, groupes, membres: new Map(membres.map((m) => [m.id, m])), prochaines };
}
