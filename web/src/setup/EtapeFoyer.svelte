<script lang="ts">
  import { untrack } from 'svelte';
  import { ApiError, setupApi, type SetupState } from '../lib/api';

  let { etat, onsuivant }: { etat: SetupState; onsuivant: () => void } = $props();

  // Valeur de départ seulement : le champ appartient ensuite à la
  // personne qui tape dedans, et ne doit pas être réécrit sous ses
  // doigts par un rechargement d'état.
  let nom = $state(
    untrack(() => etat.household?.name ?? etat.imported?.householdName ?? ''),
  );
  let erreur = $state<string | null>(null);
  let occupe = $state(false);

  const repris = $derived(Boolean(etat.imported?.householdName));
  const fuseau = $derived(
    etat.household?.timezone ?? etat.imported?.timezone ?? etat.detectedTimezone,
  );

  async function valider(evenement: SubmitEvent) {
    evenement.preventDefault();
    occupe = true;
    try {
      await setupApi.household(nom.trim());
      onsuivant();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le foyer n’a pas pu être créé.';
    } finally {
      occupe = false;
    }
  }
</script>

<form class="pile" onsubmit={valider}>
  <div>
    <h2>Votre foyer</h2>
    <p class="muet">
      {repris
        ? 'Déjà rempli d’après le téléphone. Vérifiez, corrigez si besoin.'
        : 'Son nom, et rien de plus.'}
    </p>
  </div>

  {#if erreur}
    <div class="encadre alerte">{erreur}</div>
  {/if}

  <div class="champ">
    <div class="ligne">
      <label for="nom">Nom du foyer</label>
      {#if repris}<span class="etiquette">repris du téléphone</span>{/if}
    </div>
    <input id="nom" bind:value={nom} required maxlength="80" autocomplete="off" />
    <p class="muet">C'est ce que les membres verront en ouvrant l'app.</p>
  </div>

  <!--
    Fuseau et premier jour de la semaine sont affichés, pas demandés :
    une étape de plus pour confirmer ce que la machine sait déjà n'en
    vaut pas le prix. Ils se changent dans les réglages du foyer.
  -->
  <div class="encadre douce">
    <p>Fuseau horaire détecté&nbsp;: <strong>{fuseau}</strong></p>
    <p class="muet">
      Avec la semaine qui commence le lundi. Les deux se changent dans les réglages du
      foyer.
    </p>
  </div>

  <div class="pied">
    <button type="submit" class="primaire" disabled={occupe || nom.trim().length === 0}>
      Continuer
    </button>
  </div>
</form>

<style>
  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .champ {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  label {
    font-size: 14px;
    font-weight: 500;
  }

  .etiquette {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-doux);
    border-radius: 999px;
    padding: 3px 9px;
  }

  .pied {
    display: flex;
    justify-content: flex-end;
  }
</style>
