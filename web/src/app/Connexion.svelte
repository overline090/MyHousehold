<script lang="ts">
  import { ApiError } from '../lib/api';
  import Icone from '../lib/Icone.svelte';
  import { request } from '../lib/api';
  import { seConnecter } from '../lib/session.svelte';

  let { nomDuFoyer }: { nomDuFoyer: string | null } = $props();

  let identifiant = $state('');
  let motDePasse = $state('');
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  /** Mot de passe oublié : le code donné par un administrateur, et le nouveau mot de passe. */
  let oubli = $state(false);
  let code = $state('');
  let nouveau = $state('');

  async function reinitialiser(evenement: SubmitEvent) {
    evenement.preventDefault();
    envoi = true;
    erreur = null;
    try {
      await request('/api/v1/users/password-reset', {
        method: 'POST',
        body: JSON.stringify({ username: identifiant.trim().toLowerCase(), code, newPassword: nouveau }),
      });
      await seConnecter(identifiant, nouveau);
    } catch (e) {
      erreur =
        e instanceof ApiError && e.code === 'RATE_LIMITED'
          ? 'Trop d’essais : patientez un quart d’heure avant de réessayer.'
          : e instanceof ApiError
            ? e.message
            : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

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
  {#if oubli}
    <form class="carte" onsubmit={reinitialiser}>
      <div class="marque">
        <span class="logo"><Icone nom="maison" /></span>
        <b>{nomDuFoyer ?? 'MyHousehold'}</b>
      </div>
      <h1>Mot de passe oublié</h1>
      <p class="muet">
        Demandez un code à un administrateur du foyer : il le génère depuis Administration › Membres et vous le
        donne de vive voix.
      </p>
      <label>Identifiant<input bind:value={identifiant} autocomplete="username" autocapitalize="none" required /></label>
      <label>Code reçu<input class="code" bind:value={code} autocapitalize="characters" required placeholder="XXXX-XXXX" /></label>
      <label>
        Nouveau mot de passe
        <input type="password" bind:value={nouveau} autocomplete="new-password" minlength="10" required placeholder="10 caractères au moins" />
      </label>
      {#if erreur}<div class="encadre alerte" role="alert">{erreur}</div>{/if}
      <button class="primaire" type="submit" disabled={envoi || nouveau.length < 10}>Changer le mot de passe</button>
      <button class="retour" type="button" onclick={() => ((oubli = false), (erreur = null))}>‹ Retour à la connexion</button>
    </form>
  {:else}
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

    <button class="retour" type="button" onclick={() => ((oubli = true), (erreur = null))}>Mot de passe oublié ?</button>

    <p class="muet centre">
      Pas encore de compte ? Demandez un code d’invitation à un membre du foyer, puis
      créez votre compte dans l’app.
    </p>
  </form>
  {/if}
</main>

<style>
  h1 {
    font-size: 17px;
  }

  input.code {
    font-family: ui-monospace, monospace;
    letter-spacing: 0.08em;
  }

  button.retour {
    border: none;
    background: transparent;
    color: var(--gris);
    min-height: 0;
    align-self: center;
  }

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
