<script lang="ts">
  import Wizard from './setup/Wizard.svelte';
  import Accueil from './app/Accueil.svelte';

  // L'assistant vit sur /setup, le reste de l'interface ailleurs. Pas de
  // routeur : il n'y a que deux destinations, et l'assistant garde son
  // état côté serveur.
  const surAssistant = window.location.pathname.startsWith('/setup');
</script>

{#if surAssistant}
  <Wizard />
{:else}
  <Accueil />
{/if}
