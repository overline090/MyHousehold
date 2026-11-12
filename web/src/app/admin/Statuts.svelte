<script lang="ts">
  import ChoixCouleur from '../../lib/ChoixCouleur.svelte';
  import { ApiError } from '../../lib/api';
  import { barre } from '../../lib/barre.svelte';
  import Icone from '../../lib/Icone.svelte';
  import { api } from '../../lib/session.svelte';
  import Photo from '../Photo.svelte';

  /**
   * Administration › Statuts et droits : la matrice droits × statuts.
   * Les cases cochées s'accumulent en changements, qu'on enregistre ou
   * qu'on annule d'un coup. La colonne qui a tous les droits est
   * verrouillée : il en reste toujours une.
   */
  interface Statut {
    id: string;
    name: string;
    rights: string[];
    color: string | null;
    isDefault: boolean;
    position: number;
    memberCount: number;
  }
  interface Membre {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    avatarColor?: string;
    status: { id: string };
  }

  const DROITS: [string, string][] = [
    ['VIEW', 'Voir le foyer'],
    ['COMPLETE_TASKS', 'Faire les tâches'],
    ['MANAGE_TASKS', 'Gérer les tâches'],
    ['MANAGE_APPOINTMENTS', 'Gérer les rendez-vous'],
    ['MANAGE_MEMBERS', 'Gérer les membres'],
    ['MANAGE_STATUSES', 'Gérer les statuts'],
    ['MANAGE_SERVER', 'Administrer le serveur et ses plugins'],
  ];
  const COULEURS = ['#0F766E', '#B45309', '#7C3AED', '#0369A1', '#DB2777', '#65A30D', '#475569'];

  let statuts = $state<Statut[]>([]);
  let membres = $state<Membre[]>([]);
  /** Les droits tels qu'ils seront enregistrés, par statut. */
  let brouillon = $state<Record<string, string[]>>({});
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  let fiche = $state<{ id: string | null; nom: string; couleur: string; droits: string[]; parDefaut: boolean } | null>(null);
  let destination = $state('');

  async function charger() {
    try {
      const [s, m] = await Promise.all([api<Statut[]>('/statuses'), api<Membre[]>('/members')]);
      statuts = s.sort((a, b) => a.position - b.position);
      membres = m;
      brouillon = Object.fromEntries(s.map((x) => [x.id, [...x.rights]]));
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void charger();
  });

  $effect(() => {
    barre.ajouter = { libelle: 'Nouveau statut', faire: () => ouvrir(null) };
    return () => {
      barre.ajouter = null;
    };
  });

  const verrouille = $derived(statuts.find((s) => DROITS.every(([d]) => s.rights.includes(d)))?.id ?? null);

  /** Les changements en attente, dits en clair. */
  const changements = $derived.by(() => {
    const phrases: string[] = [];
    for (const s of statuts) {
      const apres = brouillon[s.id] ?? s.rights;
      for (const [d, libelle] of DROITS) {
        const avant = s.rights.includes(d);
        const maintenant = apres.includes(d);
        if (avant !== maintenant) {
          phrases.push(`${s.name} ${maintenant ? 'pourra' : 'ne pourra plus'} ${libelle.charAt(0).toLowerCase()}${libelle.slice(1)}`);
        }
      }
    }
    return phrases;
  });

  function basculer(statutId: string, droit: string) {
    const actuels = brouillon[statutId] ?? [];
    brouillon[statutId] = actuels.includes(droit) ? actuels.filter((d) => d !== droit) : [...actuels, droit];
  }

  async function enregistrer() {
    envoi = true;
    try {
      for (const s of statuts) {
        const apres = brouillon[s.id];
        if (apres && (apres.length !== s.rights.length || apres.some((d) => !s.rights.includes(d)))) {
          await api(`/statuses/${s.id}`, { method: 'PATCH', body: JSON.stringify({ rights: apres }) });
        }
      }
      await charger();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

  function ouvrir(s: Statut | null) {
    fiche = s
      ? { id: s.id, nom: s.name, couleur: s.color ?? COULEURS[0], droits: [...(brouillon[s.id] ?? s.rights)], parDefaut: s.isDefault }
      : { id: null, nom: '', couleur: COULEURS[statuts.length % COULEURS.length], droits: ['VIEW'], parDefaut: false };
    destination = statuts.find((x) => x.id !== s?.id)?.id ?? '';
    erreur = null;
  }

  async function enregistrerFiche(e: SubmitEvent) {
    e.preventDefault();
    if (!fiche) return;
    envoi = true;
    try {
      const corps = JSON.stringify({ name: fiche.nom.trim(), color: fiche.couleur, rights: fiche.droits, isDefault: fiche.parDefaut });
      if (fiche.id) await api(`/statuses/${fiche.id}`, { method: 'PATCH', body: corps });
      else await api('/statuses', { method: 'POST', body: JSON.stringify({ ...JSON.parse(corps), position: statuts.length }) });
      fiche = null;
      await charger();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

  async function supprimer() {
    if (!fiche?.id) return;
    envoi = true;
    try {
      const porte = statuts.find((s) => s.id === fiche!.id)?.memberCount ?? 0;
      await api(`/statuses/${fiche.id}${porte ? `?moveMembersTo=${destination}` : ''}`, { method: 'DELETE' });
      fiche = null;
      await charger();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }
</script>

<section class="pile">
  {#if changements.length}
    <div class="bandeau">
      <span><b>{changements.length} changement{changements.length > 1 ? 's' : ''}</b> : {changements.join(' ; ')}.</span>
      <button onclick={() => (brouillon = Object.fromEntries(statuts.map((x) => [x.id, [...x.rights]])))}>Annuler</button>
      <button class="primaire" disabled={envoi} onclick={enregistrer}>Enregistrer</button>
    </div>
  {/if}
  {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

  <div class="matrice" role="table" aria-label="Droits par statut">
    <div class="rang titres" role="row">
      <span class="c-droit">Droit</span>
      {#each statuts as s (s.id)}
        <span class="c-statut">
          <button class="nom-statut" onclick={() => ouvrir(s)} title="Renommer, changer la couleur, supprimer">
            <i style:background={s.color ?? '#94a3b8'}></i>{s.name} ✎
          </button>
        </span>
      {/each}
    </div>
    {#each DROITS as [droit, libelle] (droit)}
      <div class="rang" role="row">
        <span class="c-droit">{libelle}</span>
        {#each statuts as s (s.id)}
          {@const coche = (brouillon[s.id] ?? s.rights).includes(droit)}
          {@const change = coche !== s.rights.includes(droit)}
          <span class="c-statut">
            <input
              type="checkbox"
              checked={coche}
              disabled={s.id === verrouille}
              class:change
              aria-label={`${s.name} — ${libelle}`}
              onchange={() => basculer(s.id, droit)}
            />
          </span>
        {/each}
      </div>
    {/each}
    <div class="rang pied" role="row">
      <span class="c-droit muet">Membres</span>
      {#each statuts as s (s.id)}<span class="c-statut muet">{s.memberCount}</span>{/each}
    </div>
  </div>
  <p class="muet">
    Cochez ou décochez pour changer un droit ; ✎ ouvre un statut pour le renommer, changer sa couleur ou le supprimer.
    La colonne qui a tous les droits est verrouillée : il reste toujours un statut qui les a tous. Un statut porté par
    quelqu’un ne se supprime qu’en confiant ses membres à un autre.
  </p>
</section>

{#if fiche}
  {@const porteurs = membres.filter((m) => m.status.id === fiche!.id)}
  <button class="voile" aria-label="Fermer" onclick={() => (fiche = null)}></button>
  <form class="panneau" onsubmit={enregistrerFiche}>
    <div class="tete-panneau">
      <i class="pastille" style:background={fiche.couleur}></i>
      <h3>{fiche.id ? fiche.nom || '…' : 'Nouveau statut'}</h3>
      <button type="button" class="fermer" aria-label="Fermer" onclick={() => (fiche = null)}><Icone nom="fermer" taille={18} /></button>
    </div>
    <div class="corps-panneau">
      <label>Nom du statut<input bind:value={fiche.nom} required maxlength="40" /></label>
      <div class="champ">
        <span>Couleur</span>
        <ChoixCouleur bind:valeur={fiche.couleur} couleurs={COULEURS} />
      </div>
      <div class="champ">
        <span>Droits</span>
        {#each DROITS as [droit, libelle] (droit)}
          <label class="interrupteur">
            {libelle}
            <input
              type="checkbox"
              checked={fiche.droits.includes(droit)}
              disabled={fiche.id === verrouille}
              onchange={() => (fiche!.droits = fiche!.droits.includes(droit) ? fiche!.droits.filter((d) => d !== droit) : [...fiche!.droits, droit])}
            />
          </label>
        {/each}
      </div>
      <label class="interrupteur">Statut donné aux nouveaux membres<input type="checkbox" bind:checked={fiche.parDefaut} /></label>
      {#if fiche.id}
        <div class="champ">
          <span>Porté par</span>
          {#each porteurs as m (m.id)}
            <span class="porteur"><Photo membre={m} taille={28} />{m.firstName} {m.lastName}</span>
          {:else}
            <span class="muet">Personne.</span>
          {/each}
        </div>
        {#if porteurs.length && fiche.id !== verrouille}
          <label>
            Pour supprimer ce statut, confier ses membres à
            <select bind:value={destination}>
              {#each statuts.filter((s) => s.id !== fiche!.id) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            </select>
          </label>
        {/if}
      {/if}
      {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
    </div>
    <div class="pied-panneau">
      {#if fiche.id}
        <button type="button" class="danger" disabled={envoi || fiche.id === verrouille} onclick={supprimer}>Supprimer</button>
      {/if}
      <span class="espace"></span>
      <button type="button" onclick={() => (fiche = null)}>Annuler</button>
      <button type="submit" class="primaire" disabled={envoi || !fiche.nom.trim()}>Enregistrer</button>
    </div>
  </form>
{/if}

<style>
  .bandeau {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fef9e7;
    border: 1px solid #f5d97a;
    color: #7c4a03;
    border-radius: 14px;
    padding: 10px 14px;
  }

  .bandeau span {
    flex: 1;
  }

  .matrice {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    overflow: auto;
  }

  .rang {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--trait);
    min-width: max-content;
  }

  .rang.titres {
    border-top: none;
    background: var(--surface-douce);
  }

  .c-droit {
    flex: 0 0 300px;
    padding: 12px 18px;
  }

  .titres .c-droit {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  .c-statut {
    flex: 0 0 170px;
    display: flex;
    justify-content: center;
    padding: 8px;
  }

  .c-statut input {
    width: 22px;
    height: 22px;
    min-height: 0;
    accent-color: var(--accent);
  }

  .c-statut input.change {
    outline: 3px solid #facc15;
    outline-offset: 1px;
  }

  .nom-statut {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 13px;
  }

  .nom-statut i,
  .pastille {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: block;
    flex: none;
  }

  .pied .c-droit,
  .pied .c-statut {
    font-size: 13px;
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
    background: var(--surface);
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
  }

  .tete-panneau h3 {
    flex: 1;
    font-size: 17px;
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
    gap: 16px;
  }

  .pied-panneau {
    display: flex;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--trait);
  }

  .espace {
    flex: 1;
  }

  .danger {
    color: #b91c1c;
  }

  label,
  .champ {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  label.interrupteur {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    font-weight: 400;
    color: var(--encre);
    padding: 6px 0;
    border-bottom: 1px solid var(--trait);
  }

  label.interrupteur input {
    width: 20px;
    height: 20px;
    min-height: 0;
    accent-color: var(--accent);
  }




  .porteur {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 400;
    color: var(--encre);
  }
</style>
