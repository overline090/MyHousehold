<script lang="ts">
  import { untrack } from 'svelte';
  import { ApiError, setupApi, type SetupState } from '../lib/api';

  let { etat }: { etat: SetupState } = $props();

  let termine = $state(untrack(() => etat.completed));
  let erreur = $state<string | null>(null);
  let occupe = $state(false);

  async function verrouiller() {
    occupe = true;
    try {
      await setupApi.complete();
      termine = true;
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le verrouillage a échoué.';
    } finally {
      occupe = false;
    }
  }
</script>

<div class="pile">
  <div class="ligne">
    <span class="coche" aria-hidden="true">✓</span>
    <div>
      <h2>« {etat.household?.name ?? 'Votre foyer'} » est en place</h2>
      <p class="muet">Il ne reste qu'à noter l'adresse du serveur.</p>
    </div>
  </div>

  {#if erreur}
    <div class="encadre alerte">{erreur}</div>
  {/if}

  <div class="encadre douce">
    <p class="muet">L'adresse de votre serveur</p>
    <p class="adresse">{etat.serverUrl}</p>
    <p class="muet">C'est elle que les autres membres saisiront dans l'app.</p>
  </div>

  <div>
    <h3>Installer l'app sur les autres téléphones</h3>
    <p class="muet">
      Chaque personne installe MyHousehold, choisit « Rejoindre un foyer » et saisit
      le code d'invitation que vous lui donnez depuis l'app ou cette interface.
    </p>
  </div>

  {#if termine}
    <div class="encadre accent">
      <p>
        Installation terminée. Les inscriptions libres sont <strong>fermées</strong>
        : on ne rejoint ce foyer que sur invitation.
      </p>
    </div>
    <div class="pied">
      <a class="bouton" href="/">Ouvrir mon foyer</a>
    </div>
  {:else}
    <p class="muet">
      Terminer ferme les inscriptions libres&nbsp;: à partir de là, on rejoint ce
      foyer sur invitation.
    </p>
    <div class="pied">
      <button type="button" class="primaire" onclick={verrouiller} disabled={occupe}>
        Terminer l'installation
      </button>
    </div>
  {/if}
</div>

<style>
  h2 {
    font-size: 20px;
    font-weight: 600;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .coche {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accent);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    flex: none;
  }

  .adresse {
    font-size: 17px;
    font-weight: 600;
    word-break: break-all;
  }

  .pied {
    display: flex;
    justify-content: flex-end;
  }

  .bouton {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 11px 18px;
    border-radius: 8px;
    background: var(--accent);
    color: #ffffff;
    font-weight: 600;
    text-decoration: none;
  }

  .bouton:hover {
    background: var(--accent-sombre);
  }
</style>
