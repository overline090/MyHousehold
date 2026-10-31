<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import { aLeDroit, api, session } from '../../lib/session.svelte';
  import Photo from '../Photo.svelte';

  /** Administration › Membres : qui fait partie du foyer, les invitations, et gérer un membre. */
  interface Membre {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    avatarColor?: string;
    status: { id: string; name: string };
  }
  interface Statut {
    id: string;
    name: string;
  }
  interface Invitation {
    id: string;
    code: string;
    status: { id: string; name: string };
    expiresAt: string;
  }
  interface Activite {
    userId: string;
    lastSeenAt: string;
    devices: number;
  }

  let membres = $state<Membre[]>([]);
  let statuts = $state<Statut[]>([]);
  let invitations = $state<Invitation[]>([]);
  let activite = $state<Map<string, Activite>>(new Map());
  let erreur = $state<string | null>(null);
  let gere = $state<Membre | null>(null);
  let inviter = $state(false);
  let statutInvitation = $state('');
  let nouvelleInvitation = $state<Invitation | null>(null);

  // Ce qui se passe dans le panneau d'un membre.
  let code = $state<{ code: string; expiresAt: string } | null>(null);
  let message = $state<string | null>(null);
  let suppression = $state(false);
  let motDePasse = $state('');
  let envoi = $state(false);

  async function charger() {
    try {
      const [m, s, i, a] = await Promise.all([
        api<Membre[]>('/members'),
        api<Statut[]>('/statuses'),
        api<Invitation[]>('/invites'),
        api<Activite[]>('/users/activity'),
      ]);
      membres = m;
      statuts = s;
      invitations = i;
      activite = new Map(a.map((x) => [x.userId, x]));
      statutInvitation ||= s.find((x) => /adulte/i.test(x.name))?.id ?? s[0]?.id ?? '';
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void charger();
  });

  function ilYA(iso: string | undefined): string {
    if (!iso) return '—';
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 5) return 'Maintenant';
    if (minutes < 60) return `Il y a ${minutes} minutes`;
    const heures = Math.round(minutes / 60);
    if (heures < 24) return `Il y a ${heures} heure${heures > 1 ? 's' : ''}`;
    const jours = Math.round(heures / 24);
    if (jours === 1) return 'Hier';
    if (jours < 14) return `Il y a ${jours} jours`;
    return `Il y a ${Math.round(jours / 7)} semaines`;
  }

  function dans(iso: string): string {
    const heures = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
    if (heures < 24) return `Expire dans ${Math.max(1, heures)} heure${heures > 1 ? 's' : ''}`;
    const jours = Math.round(heures / 24);
    return `Expire dans ${jours} jour${jours > 1 ? 's' : ''}`;
  }

  function codeLisible(c: string): string {
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
  }

  function ouvrir(m: Membre) {
    gere = m;
    code = null;
    message = null;
    suppression = false;
    motDePasse = '';
  }

  async function agir(action: () => Promise<unknown>, reussite?: string) {
    envoi = true;
    message = null;
    try {
      await action();
      if (reussite) message = reussite;
      await charger();
      if (gere) gere = membres.find((m) => m.id === gere!.id) ?? null;
    } catch (e) {
      message = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

  const changerStatut = (statusId: string) =>
    agir(() => api(`/members/${gere!.id}`, { method: 'PATCH', body: JSON.stringify({ statusId }) }), 'Statut changé.');

  const genererCode = () =>
    agir(async () => {
      code = await api<{ code: string; expiresAt: string }>(`/users/${gere!.id}/password-reset`, { method: 'POST', body: '{}' });
    });

  const toutDeconnecter = () =>
    agir(() => api(`/users/${gere!.id}/disconnect`, { method: 'POST', body: '{}' }), 'Tous ses appareils sont déconnectés.');

  async function supprimer(e: SubmitEvent) {
    e.preventDefault();
    await agir(() => api(`/admin/users/${gere!.id}`, { method: 'DELETE', body: JSON.stringify({ password: motDePasse }) }));
    if (!message) gere = null;
  }

  async function creerInvitation(e: SubmitEvent) {
    e.preventDefault();
    await agir(async () => {
      nouvelleInvitation = await api<Invitation>('/invites', { method: 'POST', body: JSON.stringify({ statusId: statutInvitation }) });
    });
  }
</script>

<section class="pile">
  <div class="entete">
    <h2>Membres du foyer</h2>
    <button class="primaire" onclick={() => ((inviter = true), (nouvelleInvitation = null))}>+ Inviter quelqu’un</button>
  </div>
  {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

  {#if inviter}
    <form class="carte invitation" onsubmit={creerInvitation}>
      {#if nouvelleInvitation}
        <p>Donnez ce code à la personne : elle le saisit en créant son compte dans l’app.</p>
        <div class="grand-code">{codeLisible(nouvelleInvitation.code)}</div>
        <p class="muet">{nouvelleInvitation.status.name} · {dans(nouvelleInvitation.expiresAt).toLowerCase()}</p>
        <button type="button" onclick={() => (inviter = false)}>Terminé</button>
      {:else}
        <label>
          Statut à l’arrivée
          <select bind:value={statutInvitation}>
            {#each statuts as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
        </label>
        <div class="boutons">
          <button type="button" onclick={() => (inviter = false)}>Annuler</button>
          <button type="submit" class="primaire" disabled={envoi || !statutInvitation}>Créer le code</button>
        </div>
      {/if}
    </form>
  {/if}

  <div class="tableau" role="table" aria-label="Membres">
    <div class="rang titres" role="row"><span class="c-nom">Membre</span><span class="c-statut">Statut</span><span class="c-vu">Dernière activité</span><span class="c-act"></span></div>
    {#each membres as m (m.id)}
      <div class="rang" role="row">
        <span class="c-nom"><Photo membre={m} taille={36} /><span><b>{m.firstName} {m.lastName}</b><span class="muet">{m.username}</span></span></span>
        <span class="c-statut"><span class="etiquette">{m.status.name}</span></span>
        <span class="c-vu muet">{m.id === session.utilisateur?.id ? 'Maintenant' : ilYA(activite.get(m.id)?.lastSeenAt)}</span>
        <span class="c-act">
          {#if m.id === session.utilisateur?.id}<span class="vous">Vous</span>{:else}<button class="lien" onclick={() => ouvrir(m)}>Gérer ›</button>{/if}
        </span>
      </div>
    {/each}
  </div>

  {#if invitations.length}
    <h2>Invitations en cours</h2>
    <div class="tableau">
      {#each invitations as i (i.id)}
        <div class="rang">
          <span class="c-nom code">{codeLisible(i.code)}</span>
          <span class="c-statut"><span class="etiquette">{i.status.name}</span></span>
          <span class="c-vu muet">{dans(i.expiresAt)}</span>
          <span class="c-act"><button class="lien danger" onclick={() => agir(() => api(`/invites/${i.id}`, { method: 'DELETE' }))}>Annuler</button></span>
        </div>
      {/each}
    </div>
  {/if}

  <p class="muet">
    On ne retire pas quelqu’un du foyer : un administrateur peut seulement supprimer le compte d’un membre qui n’est
    plus joignable, depuis « Gérer ».
  </p>
</section>

{#if gere}
  {@const m = gere}
  {@const a = activite.get(m.id)}
  <button class="voile" aria-label="Fermer" onclick={() => (gere = null)}></button>
  <aside class="panneau" aria-label={`Gérer ${m.firstName}`}>
    <div class="tete-panneau">
      <Photo membre={m} taille={44} />
      <span class="qui"><b>{m.firstName} {m.lastName}</b><span class="muet">{m.username}</span></span>
      <button class="fermer" aria-label="Fermer" onclick={() => (gere = null)}><Icone nom="fermer" taille={18} /></button>
    </div>
    <div class="corps-panneau">
      <label>
        Statut
        <select value={m.status.id} disabled={envoi || !aLeDroit('MANAGE_MEMBERS')} onchange={(e) => changerStatut((e.currentTarget as HTMLSelectElement).value)}>
          {#each statuts as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
        <span class="muet aide">Ses droits changent aussitôt, sur tous ses appareils.</span>
      </label>

      <div class="carte">
        <h3>Mot de passe oublié</h3>
        <p class="muet">
          Générez un code à usage unique et donnez-le à {m.firstName} de vive voix. Il le saisit sur la page de connexion
          pour choisir un nouveau mot de passe.
        </p>
        {#if code}
          <div class="code-ligne"><span class="grand-code">{code.code}</span><span class="muet">valable 1 heure</span></div>
        {:else}
          <button onclick={genererCode} disabled={envoi}>Générer un code</button>
        {/if}
      </div>

      <div class="carte">
        <h3>Appareils</h3>
        <div class="code-ligne">
          <span>{a?.devices ?? 0} appareil{(a?.devices ?? 0) > 1 ? 's' : ''} connecté{(a?.devices ?? 0) > 1 ? 's' : ''}</span>
          {#if a?.devices}<button class="lien danger" disabled={envoi} onclick={toutDeconnecter}>Tout déconnecter</button>{/if}
        </div>
      </div>

      {#if aLeDroit('MANAGE_SERVER')}
        <div class="carte alerte-carte">
          <h3 class="rouge">Supprimer le compte</h3>
          <p class="muet">
            Seulement pour un membre qui n’est plus joignable. Son historique reste, au nom d’« Ancien membre ».
          </p>
          {#if suppression}
            <form class="pile" onsubmit={supprimer}>
              <label>Votre mot de passe, pour confirmer<input type="password" bind:value={motDePasse} required /></label>
              <div class="boutons">
                <button type="button" onclick={() => (suppression = false)}>Annuler</button>
                <button type="submit" class="supprimer" disabled={envoi || !motDePasse}>Supprimer pour de bon</button>
              </div>
            </form>
          {:else}
            <button class="danger-bouton" onclick={() => (suppression = true)}>Supprimer le compte de {m.firstName}</button>
          {/if}
        </div>
      {/if}

      {#if message}<div class="encadre">{message}</div>{/if}
    </div>
  </aside>
{/if}

<style>
  .entete {
    display: flex;
    align-items: center;
  }

  h2 {
    flex: 1;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  .rouge {
    color: #b91c1c;
  }

  .tableau {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    overflow: hidden;
  }

  .rang {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    border-top: 1px solid var(--trait);
  }

  .rang:first-child {
    border-top: none;
  }

  .rang.titres {
    background: var(--surface-douce);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  .c-nom {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .c-nom > span:last-child {
    display: flex;
    flex-direction: column;
  }

  .c-nom.code,
  .grand-code {
    font-family: ui-monospace, monospace;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .grand-code {
    font-size: 26px;
  }

  .c-statut {
    flex: 0 0 180px;
  }

  .c-vu {
    flex: 0 0 180px;
  }

  .c-act {
    flex: 0 0 90px;
    text-align: right;
  }

  .etiquette {
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--trait-net);
    border-radius: 999px;
    padding: 2px 10px;
    background: var(--surface-douce);
  }

  .vous {
    color: var(--accent);
    font-weight: 600;
  }

  button.lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }

  button.lien.danger {
    color: #b91c1c;
  }

  .carte {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 14px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .carte p {
    margin: 0;
  }

  .alerte-carte {
    border-color: #fecaca;
  }

  .invitation {
    max-width: 560px;
  }

  .boutons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .aide {
    font-size: 12px;
    font-weight: 400;
  }

  .code-ligne {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .danger-bouton {
    color: #b91c1c;
    border-color: #fecaca;
    align-self: flex-start;
  }

  button.supprimer {
    background: #b91c1c;
    border-color: #b91c1c;
    color: #fff;
  }

  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    border: none;
    border-radius: 0;
    background: rgba(16, 23, 21, 0.25);
  }

  .panneau {
    position: fixed;
    z-index: 21;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(460px, 100vw);
    background: var(--surface-douce);
    border-left: 1px solid var(--trait);
    box-shadow: -12px 0 32px rgba(16, 23, 21, 0.12);
    display: flex;
    flex-direction: column;
  }

  .tete-panneau {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--trait);
    background: var(--surface);
  }

  .qui {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .fermer {
    min-height: 36px;
    width: 36px;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .corps-panneau {
    flex: 1;
    overflow: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
