import { api } from './session.svelte';

export interface Plugin {
  id: string;
  nom: string;
  description: string;
  apporte: string[];
  disponible: boolean;
  enabled: boolean;
}

/** Les plugins du foyer : la navigation et l'accueil en dépendent. */
export const plugins = $state<{ liste: Plugin[] }>({ liste: [] });

export async function chargerPlugins(): Promise<void> {
  plugins.liste = await api<Plugin[]>('/plugins');
}

export function pluginActif(id: string): boolean {
  return plugins.liste.some((p) => p.id === id && p.enabled);
}
