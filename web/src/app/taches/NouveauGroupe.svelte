<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import { api } from '../../lib/session.svelte';

  /** Un groupe de tâches : un nom et une couleur, pour s'y retrouver dans la liste. */
  let { onFermer, onCree }: { onFermer: () => void; onCree: () => void } = $props();

  const COULEURS = ['#0F766E', '#65A30D', '#B45309', '#B91C1C', '#7C3AED', '#2563EB', '#DB2777', '#475569'];

  let nom = $state('');
  let couleur = $state(COULEURS[0]);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    envoi = true;
    try {
      await api('/task-groups', { method: 'POST', body: JSON.stringify({ name: nom.trim(), color: couleur }) });
      onCree();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }
</script>

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<form class="feuille" onsubmit={creer}>
  <div class="tete">
    <h2>Nouveau groupe</h2>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>
  <label>Nom<input bind:value={nom} required maxlength="60" placeholder="Cuisine, Jardin…" /></label>
  <div class="champ">
    <span>Couleur</span>
    <div class="couleurs" role="radiogroup" aria-label="Couleur">
      {#each COULEURS as c (c)}
        <button
          type="button"
          role="radio"
          aria-checked={couleur === c}
          aria-label={c}
          class:actif={couleur === c}
          style:background={c}
          onclick={() => (couleur = c)}
        ></button>
      {/each}
    </div>
  </div>
  {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  <div class="boutons">
    <button type="button" onclick={onFermer}>Annuler</button>
    <button type="submit" class="primaire" disabled={envoi || !nom.trim()}>Créer</button>
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
    width: min(400px, calc(100vw - 24px));
    background: var(--surface);
    border-radius: 18px;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 24px 60px rgba(16, 23, 21, 0.25);
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

  label,
  .champ {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .couleurs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .couleurs button {
    width: 30px;
    height: 30px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    border: 3px solid var(--surface);
    box-shadow: 0 0 0 1px var(--trait-net);
  }

  .couleurs button.actif {
    box-shadow: 0 0 0 2px var(--encre);
  }

  .boutons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
