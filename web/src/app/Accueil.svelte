<script lang="ts">
  import { ApiError, setupApi } from '../lib/api';

  // Tant que l'installation n'est pas faite, la racine renvoie vers
  // l'assistant : c'est la seule chose à faire sur un serveur neuf.
  let installe = $state<boolean | null>(null);

  $effect(() => {
    void (async () => {
      try {
        const etat = await setupApi.state();
        installe = etat.completed;
        if (!etat.completed) {
          window.location.replace('/setup');
        }
      } catch (e) {
        // SETUP_ALREADY_DONE : le serveur est installé, tout va bien.
        installe = e instanceof ApiError && e.code === 'SETUP_ALREADY_DONE';
      }
    })();
  });
</script>

<main>
  <div class="contenu">
    {#if installe === null}
      <div class="carte"><p class="muet">Chargement…</p></div>
    {:else if installe}
      <div class="carte pile">
        <h1>MyHousehold</h1>
        <p>
          Ce serveur est installé. L'interface du foyer — aujourd'hui, tâches,
          compteurs, agenda — arrive dans une prochaine version.
        </p>
        <p class="muet">
          En attendant, utilisez l'application sur votre téléphone&nbsp;: elle fait
          déjà tout ce que le serveur sait faire.
        </p>
      </div>
    {:else}
      <div class="carte"><p class="muet">Redirection vers l'installation…</p></div>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    padding: 28px 16px 40px;
  }

  .contenu {
    max-width: 680px;
    margin: 0 auto;
  }

  h1 {
    font-size: 22px;
    font-weight: 600;
  }
</style>
