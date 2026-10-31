<script lang="ts">
  import { ApiError } from '../lib/api';
  import { signalerUnChangement } from '../lib/barre.svelte';
  import Icone from '../lib/Icone.svelte';
  import { aLeDroit, api, session } from '../lib/session.svelte';
  import { jourDans } from './accueil/donnees';

  /** Ajouter en deux champs, comme depuis l'accueil de l'app. */
  let { onFermer }: { onFermer: () => void } = $props();

  type Type = 'tache' | 'rendez-vous' | 'fond';
  type Quand = 'une-fois' | 'avant' | 'chaque-semaine';

  const types = $derived(
    (
      [
        ['tache', 'Tâche', 'MANAGE_TASKS'],
        ['rendez-vous', 'Rendez-vous', 'MANAGE_APPOINTMENTS'],
        ['fond', 'De fond', 'MANAGE_TASKS'],
      ] as const
    ).filter(([, , droit]) => aLeDroit(droit)),
  );
  const DELAIS: [string, number][] = [
    ['7 jours', 7],
    ['14 jours', 14],
    ['1 mois', 30],
    ['3 mois', 91],
  ];
  const JOURS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  const fuseau = session.foyer?.timezone ?? 'Europe/Paris';
  let type = $state<Type>(aLeDroit('MANAGE_TASKS') ? 'tache' : 'rendez-vous');
  let titre = $state('');
  let quand = $state<Quand>('une-fois');
  let jour = $state(jourDans(fuseau));
  let heure = $state(`${String(Math.min(new Date().getHours() + 1, 22)).padStart(2, '0')}:00`);
  let delai = $state(14);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);

  async function ajouter(evenement: SubmitEvent) {
    evenement.preventDefault();
    envoi = true;
    erreur = null;
    try {
      if (type === 'rendez-vous') {
        const debut = new Date(`${jour}T${heure}:00`);
        await api('/appointments', {
          method: 'POST',
          body: JSON.stringify({
            title: titre.trim(),
            startAt: debut.toISOString(),
            endAt: new Date(debut.getTime() + 3_600_000).toISOString(),
          }),
        });
      } else if (type === 'fond') {
        await api('/tasks', {
          method: 'POST',
          body: JSON.stringify({ title: titre.trim(), kind: 'BACKGROUND', maxIntervalSeconds: delai * 86_400 }),
        });
      } else {
        const corps =
          quand === 'chaque-semaine'
            ? // « Chaque semaine » se dit le plus souvent le jour où l'on y pense.
              { kind: 'SCHEDULED', rrule: `FREQ=WEEKLY;BYDAY=${JOURS[new Date(`${jour}T12:00:00`).getDay()]}` }
            : { kind: 'ONE_OFF', ...(quand === 'avant' ? { dueDate: jour } : {}) };
        await api('/tasks', { method: 'POST', body: JSON.stringify({ title: titre.trim(), ...corps }) });
      }
      signalerUnChangement();
      onFermer();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }
</script>

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<form class="feuille" onsubmit={ajouter}>
  <div class="tete">
    <h2>Ajouter</h2>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>

  <div class="segment" role="group" aria-label="Type">
    {#each types as [valeur, libelle] (valeur)}
      <button type="button" class:actif={type === valeur} onclick={() => (type = valeur)}>{libelle}</button>
    {/each}
  </div>

  <label>Titre<input bind:value={titre} required maxlength="120" /></label>

  {#if type === 'tache'}
    <div class="champ">
      <span>Quand</span>
      <div class="puces">
        <button type="button" class:actif={quand === 'une-fois'} onclick={() => (quand = 'une-fois')}>Une fois</button>
        <button type="button" class:actif={quand === 'avant'} onclick={() => (quand = 'avant')}>Avant une date</button>
        <button type="button" class:actif={quand === 'chaque-semaine'} onclick={() => (quand = 'chaque-semaine')}>Chaque semaine</button>
      </div>
    </div>
    {#if quand === 'avant'}<label>Date limite<input type="date" bind:value={jour} required /></label>{/if}
  {:else if type === 'rendez-vous'}
    <div class="deux">
      <label>Jour<input type="date" bind:value={jour} required /></label>
      <label>Heure<input type="time" bind:value={heure} required /></label>
    </div>
  {:else}
    <div class="champ">
      <span>À refaire dans les</span>
      <div class="puces">
        {#each DELAIS as [libelle, jours] (jours)}
          <button type="button" class:actif={delai === jours} onclick={() => (delai = jours)}>{libelle}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

  <div class="boutons">
    <button type="submit" class="primaire" disabled={envoi || !titre.trim()}>Ajouter</button>
  </div>
</form>

<style>
  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    border: none;
    border-radius: 0;
    background: rgba(16, 23, 21, 0.45);
  }

  .feuille {
    position: fixed;
    z-index: 21;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, calc(100vw - 24px));
    background: var(--surface);
    border-radius: 18px;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 24px 60px rgba(16, 23, 21, 0.25);
  }

  @media (max-width: 760px) {
    .feuille {
      top: auto;
      bottom: 0;
      transform: translateX(-50%);
      width: 100vw;
      border-radius: 22px 22px 0 0;
    }
  }

  .tete {
    display: flex;
    align-items: center;
  }

  .tete h2 {
    flex: 1;
    font-size: 18px;
  }

  .fermer {
    min-height: 36px;
    width: 36px;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .segment {
    display: flex;
    border: 1px solid var(--trait-net);
    border-radius: 10px;
    overflow: hidden;
  }

  .segment button {
    flex: 1;
    border: none;
    border-radius: 0;
    min-height: 40px;
  }

  .segment button + button {
    border-left: 1px solid var(--trait-net);
  }

  .segment button.actif,
  .puces button.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  label,
  .champ {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .puces {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .puces button {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
  }

  .puces button.actif {
    border-color: var(--accent);
  }

  .deux {
    display: flex;
    gap: 10px;
  }

  .deux label {
    flex: 1;
  }

  .boutons {
    display: flex;
    justify-content: flex-end;
  }
</style>
