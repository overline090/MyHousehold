<script lang="ts">
  import { ApiError, setupApi, type SetupState } from '../lib/api';
  import Etapes from './Etapes.svelte';
  import EtapeReseau from './EtapeReseau.svelte';
  import EtapeApp from './EtapeApp.svelte';
  import EtapeFoyer from './EtapeFoyer.svelte';
  import EtapeCompte from './EtapeCompte.svelte';
  import EtapeTerminee from './EtapeTerminee.svelte';

  let etat = $state<SetupState | null>(null);
  let erreur = $state<string | null>(null);
  let chargement = $state(true);

  async function recharger() {
    try {
      etat = await setupApi.state();
      erreur = null;
    } catch (e) {
      // Un serveur déjà installé répond SETUP_ALREADY_DONE : ce n'est
      // pas une panne, c'est que la page n'a plus lieu d'être.
      erreur =
        e instanceof ApiError
          ? e.message
          : "L'assistant d'installation est injoignable.";
    } finally {
      chargement = false;
    }
  }

  $effect(() => {
    void recharger();
  });
</script>

<main>
  <div class="contenu">
    {#if chargement}
      <div class="carte"><p class="muet">Chargement…</p></div>
    {:else if erreur}
      <div class="carte pile">
        <h1>Installation</h1>
        <div class="encadre alerte">{erreur}</div>
        <p class="muet">
          Si ce serveur est déjà installé, ouvrez simplement son adresse pour accéder
          au foyer.
        </p>
      </div>
    {:else if etat}
      <Etapes steps={etat.steps} courante={etat.currentStep} />

      <div class="carte">
        {#if etat.currentStep === 'network'}
          <EtapeReseau onsuivant={recharger} />
        {:else if etat.currentStep === 'import'}
          <EtapeApp {etat} onsuivant={recharger} />
        {:else if etat.currentStep === 'household'}
          <EtapeFoyer {etat} onsuivant={recharger} />
        {:else if etat.currentStep === 'account'}
          <EtapeCompte {etat} onsuivant={recharger} />
        {:else}
          <EtapeTerminee {etat} />
        {/if}
      </div>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    padding: 28px 16px 40px;
  }

  .contenu {
    max-width: 980px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .carte {
    padding: 28px;
  }

  @media (max-width: 640px) {
    .carte {
      padding: 20px;
    }
  }
</style>
