import { api } from '../../lib/session.svelte';

/** Ce que l'accueil lit du serveur, et les règles qui le rangent en tuiles. */

export interface Occurrence {
  id: string;
  taskId: string;
  title: string;
  kind: 'SCHEDULED' | 'BACKGROUND' | 'ONE_OFF';
  priority: number;
  group: { id: string; name: string; color: string } | null;
  scheduledFor: string | null;
  dueAt: string | null;
  status: 'PENDING' | 'DONE' | 'SKIPPED' | 'MISSED';
  assignee: { id: string; firstName: string; lastName: string } | null;
  completedAt: string | null;
}

export interface TacheDeFond {
  id: string;
  title: string;
  priority: number;
  group: { id: string; name: string; color: string } | null;
  maxIntervalSeconds: number | null;
  lastDoneAt: string | null;
  elapsedSeconds: number | null;
  state: 'NEVER_DONE' | 'OK' | 'DUE_SOON' | 'OVERDUE';
}

/** Une occurrence de rendez-vous : un rendez-vous qui se répète en donne plusieurs. */
export interface RendezVous {
  appointmentId: string;
  title: string;
  location: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
}

export interface Membre {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  avatarColor?: string;
}

export interface Accueil {
  aujourdHui: string;
  enRetard: Occurrence[];
  fondEnRetard: TacheDeFond[];
  mesTaches: Occurrence[];
  autres: Occurrence[];
  aSurveiller: TacheDeFond[];
  rendezVous: RendezVous[];
  membres: Map<string, Membre>;
}

/** Ce qui traîne depuis plus longtemps n'encombre pas l'accueil. */
const JOURS_DE_RETARD = 30;

export function jourDans(fuseau: string, date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuseau }).format(date);
}

function decaler(jour: string, jours: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

export async function chargerAccueil(fuseau: string, moi: string): Promise<Accueil> {
  const aujourdHui = jourDans(fuseau);
  const maintenant = new Date();
  const dansUneSemaine = new Date(maintenant.getTime() + 7 * 86_400_000);

  const [occurrences, deFond, rendezVous, membres] = await Promise.all([
    api<{ data: Occurrence[] }>(
      `/occurrences?from=${decaler(aujourdHui, -JOURS_DE_RETARD)}&to=${aujourdHui}&limit=200`,
    ),
    api<TacheDeFond[]>('/tasks?kind=BACKGROUND'),
    api<RendezVous[]>(
      `/appointments?from=${encodeURIComponent(new Date(`${aujourdHui}T00:00:00`).toISOString())}&to=${encodeURIComponent(dansUneSemaine.toISOString())}`,
    ),
    api<Membre[]>('/members'),
  ]);

  const pourMoi = (o: Occurrence) => o.assignee === null || o.assignee.id === moi;
  const parPriorite = <T extends { priority: number }>(a: T, b: T) => b.priority - a.priority;
  const liste = occurrences.data;

  return {
    aujourdHui,
    enRetard: liste
      .filter((o) => (o.status === 'PENDING' || o.status === 'MISSED') && o.scheduledFor !== null && o.scheduledFor < aujourdHui && pourMoi(o))
      .sort(parPriorite),
    fondEnRetard: deFond.filter((t) => t.state === 'OVERDUE').sort(parPriorite),
    mesTaches: liste.filter((o) => o.scheduledFor === aujourdHui && o.status !== 'SKIPPED' && pourMoi(o)).sort(parPriorite),
    autres: liste.filter((o) => o.scheduledFor === aujourdHui && o.status === 'PENDING' && !pourMoi(o)),
    aSurveiller: deFond.filter((t) => t.state === 'DUE_SOON'),
    rendezVous: rendezVous.sort((a, b) => a.startAt.localeCompare(b.startAt)),
    membres: new Map(membres.map((m) => [m.id, m])),
  };
}

// ── Mises en mots ─────────────────────────────────────────────────────

const PRIORITES: Record<number, string> = {
  3: 'Urgente',
  2: 'Très haute',
  1: 'Haute',
  [-1]: 'Basse',
  [-2]: 'Très basse',
  [-3]: 'En dernier',
};

/** Une priorité normale ne porte pas d'étiquette : si tout est étiqueté, plus rien ne ressort. */
export function priorite(valeur: number): { libelle: string; classe: string } | null {
  const libelle = PRIORITES[valeur];
  if (!libelle) return null;
  return { libelle, classe: valeur >= 3 ? 'urgente' : valeur > 0 ? 'haute' : 'basse' };
}

export function joursEnClair(secondes: number): string {
  const jours = Math.round(secondes / 86_400);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return '1 jour';
  if (jours < 60) return `${jours} jours`;
  return `${Math.round(jours / 30)} mois`;
}

export function heureEnClair(iso: string, fuseau: string): string | null {
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso))
    .split(':');
  // Une échéance « dans la journée » tombe en fin de journée (… h 59) : elle
  // n'a pas d'heure à afficher.
  if (m === '59') return null;
  return `${Number(h)} h ${m}`;
}

export function retardEnClair(jour: string, aujourdHui: string): string {
  const jours = Math.round((Date.parse(aujourdHui) - Date.parse(jour)) / 86_400_000);
  return jours === 1 ? 'Depuis hier' : `En retard de ${jours} jours`;
}

export function jourEnClair(iso: string, fuseau: string, aujourdHui: string): string {
  const jour = jourDans(fuseau, new Date(iso));
  if (jour === aujourdHui) return 'Aujourd’hui';
  if (jour === decaler(aujourdHui, 1)) return 'Demain';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, weekday: 'long', day: 'numeric' }).format(new Date(iso));
}
