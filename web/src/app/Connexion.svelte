<script lang="ts">
  import { ApiError } from '../lib/api';
  import Icone from '../lib/Icone.svelte';
  import { seConnecter } from '../lib/session.svelte';

  let { nomDuFoyer }: { nomDuFoyer: string | null } = $props();

  let identifiant = $state('');
  let motDePasse = $state('');
  let erreur = $state<string | null>(null);
  let envoi = $state(false);

  async function connecter(evenement: SubmitEvent) {
    evenement.preventDefault();
    envoi = true;
    erreur = null;
    try {
      await seConnecter(identifiant, motDePasse);
    } catch (e) {
      erreur =
        e instanceof ApiError && e.code === 'RATE_LIMITED'
          ? 'Trop d’essais : patientez un quart d’heure avant de réessayer.'
          : e instanceof ApiError && e.status === 401
            ? 'Identifiant ou mot de passe incorrect.'
            : e instanceof ApiError
              ? e.message
              : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }
</script>

<main>
  <form class="carte" onsubmit={connecter}>
    <div class="marque">
      <span class="logo"><Icone nom="maison" /></span>
      <b>{nomDuFoyer ?? 'MyHousehold'}</b>
    </div>

    <label>
      Identifiant
      <input bind:value={identifiant} autocomplete="username" autocapitalize="none" required />
    </label>
    <label>
      Mot de passe
      <input type="password" bind:value={motDePasse} autocomplete="current-password" required />
    </label>

    {#if erreur}
      <div class="encadre alerte" role="alert">{erreur}</div>
    {/if}

    <button class="primaire" type="submit" disabled={envoi}>
      {envoi ? 'Connexion…' : 'Se connecter'}
    </button>

    <p class="muet centre">
      Pas encore de compte ? Demandez un code d’invitation à un membre du foyer, puis
      créez votre compte dans l’app. La remise à zéro d’un mot de passe oublié, par un
      administrateur, arrive dans une prochaine version.
    </p>
  </form>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  form {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 28px 30px;
  }

  .marque {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 17px;
    margin-bottom: 6px;
  }

  .logo {
    width: 40px;
    height: 40px;
    border-radius: 11px;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .centre {
    text-align: center;
  }
</style>
