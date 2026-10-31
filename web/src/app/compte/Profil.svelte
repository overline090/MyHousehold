<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { api, seConnecter, session, type Utilisateur } from '../../lib/session.svelte';
  import Photo from '../Photo.svelte';

  /** Mon profil : photo, identité, mot de passe, et la seule sortie du foyer — supprimer son compte. */
  const moi = $derived(session.utilisateur!);

  let prenom = $state(session.utilisateur?.firstName ?? '');
  let nom = $state(session.utilisateur?.lastName ?? '');
  let naissance = $state(session.utilisateur?.birthDate?.slice(0, 10) ?? '');
  let identifiant = $state(session.utilisateur?.username ?? '');
  let messageIdentite = $state<{ texte: string; erreur: boolean } | null>(null);

  let actuel = $state('');
  let nouveau = $state('');
  let messageMotDePasse = $state<{ texte: string; erreur: boolean } | null>(null);

  let messagePhoto = $state<string | null>(null);
  let fichier = $state<HTMLInputElement>();

  let suppression = $state(false);
  let motDePasseSuppression = $state('');
  let messageSuppression = $state<string | null>(null);
  let envoi = $state(false);

  async function relire() {
    const reponse = await api<{ user: Utilisateur }>('/auth/me');
    session.utilisateur = reponse.user;
  }

  async function enregistrerIdentite(e: SubmitEvent) {
    e.preventDefault();
    envoi = true;
    try {
      await api('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: prenom.trim(),
          lastName: nom.trim(),
          birthDate: naissance || null,
          ...(identifiant.trim().toLowerCase() !== moi.username ? { username: identifiant.trim().toLowerCase() } : {}),
        }),
      });
      await relire();
      messageIdentite = { texte: 'Enregistré.', erreur: false };
    } catch (err) {
      messageIdentite = { texte: err instanceof ApiError ? err.message : 'Le serveur ne répond pas.', erreur: true };
    } finally {
      envoi = false;
    }
  }

  async function changerMotDePasse(e: SubmitEvent) {
    e.preventDefault();
    envoi = true;
    try {
      await api('/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: actuel, newPassword: nouveau }),
      });
      // Changer de mot de passe déconnecte tous les appareils, celui-ci
      // compris : on s'y reconnecte aussitôt avec le nouveau.
      await seConnecter(moi.username, nouveau);
      actuel = '';
      nouveau = '';
      messageMotDePasse = { texte: 'Mot de passe changé. Vos autres appareils devront se reconnecter.', erreur: false };
    } catch (err) {
      messageMotDePasse = { texte: err instanceof ApiError ? err.message : 'Le serveur ne répond pas.', erreur: true };
    } finally {
      envoi = false;
    }
  }

  async function envoyerPhoto() {
    const f = fichier?.files?.[0];
    if (!f) return;
    const corps = new FormData();
    corps.append('file', f);
    try {
      await api('/users/me/avatar', { method: 'PUT', body: corps });
      await relire();
      messagePhoto = null;
    } catch (err) {
      messagePhoto = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
    }
    if (fichier) fichier.value = '';
  }

  async function retirerPhoto() {
    await api('/users/me/avatar', { method: 'DELETE' }).catch(() => {});
    await relire();
  }

  async function supprimerCompte(e: SubmitEvent) {
    e.preventDefault();
    envoi = true;
    try {
      await api('/users/me', { method: 'DELETE', body: JSON.stringify({ password: motDePasseSuppression }) });
      session.utilisateur = null;
      window.location.replace('/');
    } catch (err) {
      messageSuppression = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
      envoi = false;
    }
  }
</script>

<div class="grille">
  <section class="carte photo">
    <Photo membre={moi} taille={120} />
    <input bind:this={fichier} type="file" accept="image/*" hidden onchange={envoyerPhoto} />
    <button class="lien" onclick={() => fichier?.click()}>Changer la photo</button>
    {#if moi.avatarUrl}<button class="lien discret" onclick={retirerPhoto}>Retirer la photo</button>{/if}
    {#if messagePhoto}<p class="erreur">{messagePhoto}</p>{/if}
    <h2>{moi.firstName} {moi.lastName}</h2>
    <span class="statut">{moi.status.name}</span>
    <p class="muet petit">Le statut se change dans Administration › Membres, par quelqu’un qui en a le droit.</p>
  </section>

  <form class="carte" onsubmit={enregistrerIdentite}>
    <h3>Identité</h3>
    <div class="deux">
      <label>Prénom<input bind:value={prenom} required maxlength="60" /></label>
      <label>Nom<input bind:value={nom} required maxlength="60" /></label>
    </div>
    <div class="deux">
      <label>Date de naissance<input type="date" bind:value={naissance} /></label>
      <label>
        Identifiant
        <input bind:value={identifiant} required autocomplete="username" />
      </label>
    </div>
    <div class="pied">
      {#if messageIdentite}<span class:erreur={messageIdentite.erreur} class:ok={!messageIdentite.erreur}>{messageIdentite.texte}</span>{/if}
      <button type="submit" class="primaire" disabled={envoi}>Enregistrer</button>
    </div>
  </form>

  <form class="carte" onsubmit={changerMotDePasse}>
    <h3>Mot de passe</h3>
    <label>Mot de passe actuel<input type="password" bind:value={actuel} required autocomplete="current-password" /></label>
    <label>
      Nouveau mot de passe
      <input type="password" bind:value={nouveau} required minlength="10" autocomplete="new-password" placeholder="10 caractères au moins" />
    </label>
    <div class="pied">
      {#if messageMotDePasse}<span class:erreur={messageMotDePasse.erreur} class:ok={!messageMotDePasse.erreur}>{messageMotDePasse.texte}</span>{/if}
      <button type="submit" disabled={envoi || nouveau.length < 10 || !actuel}>Changer</button>
    </div>
  </form>

  <section class="carte">
    <h3>Mon agenda personnel</h3>
    <p class="muet">
      Relier son agenda (Google, Nextcloud…) arrive avec la synchronisation des agendas : vos rendez-vous y
      apparaîtront comme « Occupé », sans leur titre, sauf si vous choisissez de les partager.
    </p>
    <hr />
    {#if !suppression}
      <button class="lien danger" onclick={() => (suppression = true)}>Supprimer mon compte ›</button>
    {:else}
      <form class="pile" onsubmit={supprimerCompte}>
        <p>
          <b>C’est irréversible.</b> Votre compte disparaît ; ce que vous avez fait reste dans l’historique du foyer,
          sans votre nom.
        </p>
        <label>Votre mot de passe, pour confirmer<input type="password" bind:value={motDePasseSuppression} required /></label>
        {#if messageSuppression}<p class="erreur">{messageSuppression}</p>{/if}
        <div class="pied">
          <button type="button" onclick={() => (suppression = false)}>Annuler</button>
          <button type="submit" class="supprimer" disabled={envoi || !motDePasseSuppression}>Supprimer mon compte</button>
        </div>
      </form>
    {/if}
  </section>
</div>

<style>
  .grille {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.4fr);
    gap: 20px;
    align-items: start;
  }

  @media (max-width: 900px) {
    .grille {
      grid-template-columns: 1fr;
    }
  }

  .carte {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .photo {
    align-items: center;
    text-align: center;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  h2 {
    font-size: 18px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
    flex: 1;
  }

  .deux {
    display: flex;
    gap: 14px;
  }

  .pied {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .statut {
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--trait-net);
    border-radius: 999px;
    padding: 2px 10px;
  }

  .petit {
    font-size: 13px;
    margin: 0;
  }

  button.lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }

  button.lien.discret {
    color: var(--gris);
    font-weight: 500;
    font-size: 13px;
  }

  button.lien.danger {
    color: #b91c1c;
    align-self: flex-start;
  }

  button.supprimer {
    background: #b91c1c;
    border-color: #b91c1c;
    color: #fff;
  }

  .erreur {
    color: #b91c1c;
    font-size: 13px;
  }

  .ok {
    color: #15803d;
    font-size: 13px;
  }

  hr {
    border: none;
    border-top: 1px solid var(--trait);
    width: 100%;
  }
</style>
