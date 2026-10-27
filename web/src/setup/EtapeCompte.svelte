<script lang="ts">
  import QrServeur from './QrServeur.svelte';
  import { ApiError, setupApi, type Pairing, type SetupState } from '../lib/api';

  let { onsuivant }: { etat: SetupState; onsuivant: () => void } = $props();

  let appariement = $state<Pairing | null>(null);
  let erreur = $state<string | null>(null);

  async function demanderCode() {
    try {
      appariement = await setupApi.createPairing('CLAIM');
      erreur = null;
      attendreLeTelephone();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Impossible de créer un code.';
    }
  }

  function attendreLeTelephone() {
    const code = appariement?.code;
    if (!code) return;

    const minuterie = setInterval(async () => {
      try {
        const { status } = await setupApi.pairingStatus(code);
        if (status === 'USED') {
          clearInterval(minuterie);
          onsuivant();
        } else if (status === 'EXPIRED') {
          clearInterval(minuterie);
          appariement = null;
          erreur = 'Ce code a expiré. Demandez-en un nouveau.';
        }
      } catch {
        clearInterval(minuterie);
      }
    }, 2000);
  }

  $effect(() => {
    if (!appariement) void demanderCode();
  });
</script>

<div class="disposition">
  <div class="pile">
    <div>
      <h2>Créez votre compte depuis votre téléphone</h2>
      <p class="muet">
        Ce premier compte sera <strong>administrateur du serveur</strong>. C'est le
        seul qui pourra supprimer le compte d'un membre qui n'est plus joignable.
      </p>
    </div>

    {#if erreur}
      <div class="encadre alerte">{erreur}</div>
    {/if}

    <ol>
      <li>
        Installez MyHousehold sur votre téléphone — depuis F-Droid, ou l'APK de la
        dernière version.
      </li>
      <li>Ouvrez l'app, choisissez <strong>Scanner le QR code du serveur</strong>.</li>
      <li>Scannez le code ci-contre, puis créez votre compte dans l'app.</li>
    </ol>

    <p class="attente" aria-live="polite">
      <span class="point" aria-hidden="true"></span> En attente du téléphone…
    </p>

    <p class="muet">
      Sans téléphone sous la main, un compte peut être créé depuis ce navigateur —
      mais un compte administrateur jamais rattaché à un téléphone, c'est un foyer
      que personne ne peut plus administrer le jour où il le faudrait.
    </p>
  </div>

  <aside class="pile">
    {#if appariement}
      <QrServeur {appariement} />
      <p class="muet">Ou code à saisir dans l'app</p>
      <p class="code">{appariement.code}</p>
      <p class="muet">Valable 15 minutes, à usage unique.</p>
    {:else}
      <p class="muet">Préparation du code…</p>
    {/if}

    <div class="encadre alerte">
      Ne partagez ce code avec personne&nbsp;: il donne le compte administrateur du
      foyer.
    </div>
  </aside>
</div>

<style>
  .disposition {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
  }

  .disposition > * {
    flex: 1 1 280px;
    min-width: 0;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  ol {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--encre-douce);
    font-size: 14px;
  }

  .attente {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .point {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
