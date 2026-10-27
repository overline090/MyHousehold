/**
 * Accès à l'API du serveur.
 *
 * Toutes les erreurs du serveur arrivent dans une enveloppe unique
 * `{ error: { code, message, details } }` : `code` est destiné au code,
 * `message` à l'humain. L'interface affiche le message et ne teste que
 * le code.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // Serveur arrêté, Wi-Fi coupé, bascule réseau en cours pendant
    // l'installation : ce n'est pas une erreur applicative.
    throw new ApiError(
      'NETWORK',
      'Le serveur ne répond pas. Vérifiez votre connexion au réseau de la maison.',
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const texte = await response.text();
  let corps: unknown = null;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = null;
  }

  if (!response.ok) {
    const erreur = (corps as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      erreur?.code ?? 'INCONNU',
      erreur?.message ?? `Le serveur a répondu ${response.status}.`,
      response.status,
      erreur?.details,
    );
  }

  return corps as T;
}

// ── Assistant d'installation ──────────────────────────────────────────

export type SetupStepId = 'network' | 'import' | 'household' | 'account' | 'done';

export interface SetupStep {
  id: SetupStepId;
  label: string;
  applicable: boolean;
  required: boolean;
  done: boolean;
}

export interface ImportedSummary {
  householdName: string;
  timezone: string | null;
  tasks: unknown[];
  backgroundTasks: unknown[];
  appointments: unknown[];
}

export interface SetupState {
  completed: boolean;
  currentStep: SetupStepId;
  steps: SetupStep[];
  serverUrl: string;
  household: { id: string; name: string; timezone: string } | null;
  detectedTimezone: string;
  imported: ImportedSummary | null;
}

export interface Pairing {
  code: string;
  purpose: 'IMPORT' | 'CLAIM';
  expiresAt: string;
  url: string;
  /** Ce qu'encode le QR code : adresse, empreinte entière, code. */
  link: string;
  qrSvg: string;
  /** Adresse du serveur sur le réseau de la maison. */
  address: string;
  /** Empreinte du certificat, telle que l'app l'affiche. */
  fingerprint: string;
}

export const setupApi = {
  state: () => request<SetupState>('/setup/state'),

  createPairing: (purpose: 'IMPORT' | 'CLAIM') =>
    request<Pairing>('/setup/pairing', {
      method: 'POST',
      body: JSON.stringify({ purpose }),
    }),

  pairingStatus: (code: string) =>
    request<{ status: 'PENDING' | 'USED' | 'EXPIRED' }>(
      `/setup/pairing/${encodeURIComponent(code)}`,
    ),

  skip: (step: 'network' | 'import') =>
    request<SetupState>('/setup/skip', {
      method: 'POST',
      body: JSON.stringify({ step }),
    }),

  household: (name: string) =>
    request<SetupState>('/setup/household', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  complete: () =>
    request<{ completed: boolean; serverUrl: string; householdId: string }>(
      '/setup/complete',
      { method: 'POST' },
    ),
};

// ── Foyer ─────────────────────────────────────────────────────────────

export interface Status {
  id: string;
  name: string;
  rights: string[];
  isDefault: boolean;
  position: number;
  memberCount: number;
}

export const householdApi = {
  statuses: (token: string) =>
    request<Status[]>('/api/v1/statuses', {
      headers: { authorization: `Bearer ${token}` },
    }),

  /** Le statut est explicite : un code d'invitation donne des droits. */
  createInvite: (statusId: string, token: string) =>
    request<{ code: string; expiresAt: string }>('/api/v1/invites', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ statusId }),
    }),
};
