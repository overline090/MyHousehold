<script lang="ts">
  import { request } from '../lib/api';

  let version = $state<string | null>(null);
  $effect(() => {
    request<{ version: string }>('/version')
      .then((v) => (version = v.version))
      .catch(() => {});
  });
</script>

<div class="carte pile">
  <h2>MyHousehold</h2>
  <p>Serveur, version {version ?? '…'}.</p>
  <p>
    Projet communautaire : libre d’usage et de modification, sans en tirer de profit
    (licence PolyForm Noncommercial 1.0.0).
  </p>
</div>

<style>
  .carte {
    max-width: 640px;
  }
</style>
