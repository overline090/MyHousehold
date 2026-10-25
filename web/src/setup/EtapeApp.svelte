<script lang="ts">
  import { ApiError, setupApi, type Pairing, type SetupState } from '../lib/api';

  let { etat, onsuivant }: { etat: SetupState; onsuivant: () => void } = $props();

  let appariement = $state<Pairing | null>(null);
  let erreur = $state<string | null>(null);
  let occupe = $state(false);

  async function passer() {
    occupe = true;
    try {
      // L'état vit côté serveur : « rien à importer » doit y être
      // enregistré, sinon l'étape resterait courante au rechargement.
      await setupApi.skip('import');
      onsuivant();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : "L'étape n'a pas pu être passée.";
    } finally {
      occupe = false;
    }
  }

  async function demanderCode() {
    occupe = true;
    try {
      appariement = await setupApi.createPairing('IMPORT');
      erreur = null;
      attendreLeTelephone();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Impossible de créer un code.';
    } finally {
      occupe = false;
    }
  }

  /**
   * La page interroge le serveur : c'est lui qui sait quand le téléphone
   * a poussé sa configuration, l'état de l'installation vivant en base
   * et non dans cet onglet.
   */
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
</script>

<div class="pile">
  <div>
    <h2>Utilisez-vous déjà l'application&nbsp;?</h2>
    <p class="muet">
      L'app fonctionne sans serveur. Si votre foyer existe déjà sur un téléphone,
      nous le reprenons tel quel — vous n'aurez rien à ressaisir.
    </p>
  </div>

  {#if erreur}
    <div class="encadre alerte">{erreur}</div>
  {/if}

  <div class="choix">
    <section class="carte-choix accent">
      <h3>Oui, reprendre mon foyer</h3>
      <p class="muet">
        Dans l'app&nbsp;: <strong>Réglages → Connecter un serveur</strong>, puis
        saisissez ce code.
      </p>

      {#if appariement}
        <p class="code">{appariement.code}</p>
        <p class="muet">Valable 15 minutes.</p>
        <p class="attente" aria-live="polite">
          <span class="point" aria-hidden="true"></span> En attente du téléphone…
        </p>
      {:else}
        <button type="button" class="primaire" onclick={demanderCode} disabled={occupe}>
          Afficher le code
        </button>
      {/if}
    </section>

    <section class="carte-choix">
      <h3>Non, commencer de zéro</h3>
      <p class="muet">
        Nous créerons le foyer ici, et vous installerez l'app ensuite. Vous pourrez
        toujours importer un téléphone plus tard.
      </p>
      <button type="button" onclick={passer} disabled={occupe}>
        Continuer sans importer
      </button>
    </section>
  </div>

  {#if etat.imported}
    <div class="encadre accent">
      <p>
        Déjà repris&nbsp;: <strong>{etat.imported.householdName}</strong>,
        {etat.imported.tasks.length} tâche(s) et {etat.imported.counters.length} compteur(s).
      </p>
    </div>
  {/if}

  <p class="muet">
    Un téléphone déjà connecté à un autre serveur ne peut pas être importé ici.
  </p>
</div>

<style>
  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  h3 {
    font-size: 16px;
    font-weight: 600;
  }

  .choix {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  .carte-choix {
    flex: 1 1 280px;
    border: 1px solid var(--trait-net);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .carte-choix.accent {
    border: 2px solid var(--accent);
    background: var(--accent-doux);
  }

  .attente {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .point {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
