<script lang="ts">
  import Wizard from './setup/Wizard.svelte';
  import Cadre from './app/Cadre.svelte';
  import Connexion from './app/Connexion.svelte';
  import Accueil from './app/accueil/Accueil.svelte';
  import AVenir from './app/AVenir.svelte';
  import APropos from './app/APropos.svelte';
  import { ApiError, setupApi } from './lib/api';
  import { chargerPreferences } from './lib/preferences.svelte';
  import { route } from './lib/route.svelte';
  import { restaurer, session } from './lib/session.svelte';

  /** Les pages dont la maquette est validée mais pas encore écrite. */
  const A_VENIR: Record<string, string> = {
    '/taches': 'Tâches',
    '/agenda': 'Agenda',
    '/foyer': 'Foyer',
    '/administration': 'Administration',
    '/preferences': 'Préférences',
    '/profil': 'Mon profil',
    '/appareils': 'Mes appareils',
  };

  const surAssistant = $derived(route.chemin.startsWith('/setup'));
  let installe = $state<boolean | null>(null);

  // Tant que l'installation n'est pas faite, tout mène à l'assistant.
  $effect(() => {
    if (surAssistant) return;
    void (async () => {
      try {
        const etat = await setupApi.state();
        installe = etat.completed;
        if (!etat.completed) window.location.replace('/setup');
      } catch (e) {
        installe = e instanceof ApiError && e.code === 'SETUP_ALREADY_DONE';
      }
      if (installe) await restaurer();
    })();
  });

  $effect(() => {
    if (session.utilisateur) void chargerPreferences().catch(() => {});
  });

  const page = $derived(
    Object.entries(A_VENIR).find(([chemin]) => route.chemin.startsWith(chemin))?.[1] ?? null,
  );
</script>

{#if surAssistant}
  <Wizard />
{:else if installe === false}
  <div class="attente"><p class="muet">Le serveur n’est pas encore installé…</p></div>
{:else if installe === null || !session.prete}
  <div class="attente"><p class="muet">Chargement…</p></div>
{:else if !session.utilisateur}
  <Connexion nomDuFoyer={session.foyer?.name ?? null} />
{:else}
  <Cadre>
    {#if route.chemin === '/a-propos'}
      <APropos />
    {:else if page}
      <AVenir nom={page} />
    {:else}
      <Accueil />
    {/if}
  </Cadre>
{/if}

<style>
  .attente {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
