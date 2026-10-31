import { api } from './session.svelte';

export type Taille = 'S' | 'M' | 'L' | 'XL';
export interface Tuile {
  id: string;
  taille: Taille;
}

export interface Preferences {
  accueil?: Tuile[];
  navigationRepliee?: boolean;
  pageOuverture?: 'accueil' | 'taches' | 'agenda';
  apparence?: 'auto' | 'clair' | 'sombre';
}

/** Les préférences du compte : elles le suivent d'un appareil à l'autre. */
export const preferences = $state<{ valeurs: Preferences; chargees: boolean }>({
  valeurs: {},
  chargees: false,
});

export async function chargerPreferences(): Promise<void> {
  try {
    preferences.valeurs = await api<Preferences>('/users/me/preferences');
  } finally {
    preferences.chargees = true;
  }
}

/** Ce qui est envoyé remplace, ce qui manque est gardé — côté serveur comme ici. */
export async function enregistrerPreferences(changement: Preferences): Promise<void> {
  preferences.valeurs = { ...preferences.valeurs, ...changement };
  preferences.valeurs = await api<Preferences>('/users/me/preferences', {
    method: 'PUT',
    body: JSON.stringify(changement),
  });
}
