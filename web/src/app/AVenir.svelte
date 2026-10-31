<script lang="ts">
  /** Une page dont la maquette est validée, mais pas encore écrite : on le dit plutôt que d'afficher une page vide. */
  let { nom }: { nom: string } = $props();
</script>

<div class="carte pile">
  <h2>{nom}</h2>
  <p>Cette page arrive dans une prochaine version, d’après sa maquette validée.</p>
  <p class="muet">En attendant, l’application sur votre téléphone fait déjà tout ce que le serveur sait faire.</p>
</div>

<style>
  .carte {
    max-width: 640px;
  }
</style>
