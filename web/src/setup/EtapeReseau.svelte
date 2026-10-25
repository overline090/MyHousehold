<script lang="ts">
  import { setupApi } from '../lib/api';

  let { onsuivant }: { onsuivant: () => void } = $props();

  async function passer() {
    await setupApi.skip('network');
    onsuivant();
  }
</script>

<div class="pile">
  <div>
    <h2>Connecter le serveur au réseau</h2>
    <p class="muet">
      Le serveur doit rejoindre le réseau de la maison pour que les téléphones du
      foyer le trouvent.
    </p>
  </div>

  <!--
    Cette étape n'apparaît que sur l'image Raspberry Pi, qui pilote les
    interfaces réseau de la machine. Son interface vivra ici quand
    l'image existera ; en attendant, l'assistant la déclare non
    applicable et ne l'affiche pas.
  -->
  <div class="encadre douce">
    <p>
      La configuration réseau est pilotée par l'image Raspberry Pi. Sur cette
      installation, le réseau est déjà en place.
    </p>
  </div>

  <div class="pied">
    <button type="button" class="primaire" onclick={passer}>Continuer</button>
  </div>
</div>

<style>
  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .pied {
    display: flex;
    justify-content: flex-end;
  }
</style>
