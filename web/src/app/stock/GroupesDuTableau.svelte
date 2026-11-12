<script lang="ts">
  import { ApiError } from '../../lib/api';
  import ChoixCouleur from '../../lib/ChoixCouleur.svelte';
  import Icone from '../../lib/Icone.svelte';
  import { api } from '../../lib/session.svelte';
  import type { Article, Groupe, Tableau } from './donnees';

  /**
   * Les groupes d'un tableau (la pharmacie : groupe A, groupe B…) : les
   * créer, les renommer, les ordonner, les supprimer. Supprimer un groupe
   * garde ses articles, « Sans groupe ».
   */
  let {
    tableau,
    groupes,
    articles,
    onFermer,
    onChange,
  }: { tableau: Tableau; groupes: Groupe[]; articles: Article[]; onFermer: () => void; onChange: () => Promise<void> } = $props();

  const COULEURS = ['#0F766E', '#B91C1C', '#0369A1', '#D97706', '#7C3AED', '#65A30D', '#DB2777', '#475569'];

  const duTableau = $derived(groupes.filter((g) => g.boardId === tableau.id).sort((a, b) => a.position - b.position));
  let nom = $state('');
  let couleur = $state(COULEURS[0]);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  let edition = $state<{ id: string; nom: string; couleur: string } | null>(null);
  let aSupprimer = $state<string | null>(null);

  async function faire(action: () => Promise<unknown>) {
    envoi = true;
    erreur = null;
    try {
      await action();
      await onChange();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

  function creer(e: SubmitEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    void faire(async () => {
      await api('/stock/groups', {
        method: 'POST',
        body: JSON.stringify({ boardId: tableau.id, name: nom.trim(), color: couleur, position: duTableau.length }),
      });
      nom = '';
    });
  }

  function deplacer(i: number, sens: -1 | 1) {
    const liste = [...duTableau];
    const [g] = liste.splice(i, 1);
    liste.splice(i + sens, 0, g);
    void faire(() => Promise.all(liste.map((x, k) => api(`/stock/groups/${x.id}`, { method: 'PATCH', body: JSON.stringify({ position: k }) }))));
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onFermer()} />

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<div class="panneau" role="dialog" aria-label={`Groupes : ${tableau.name}`}>
  <div class="tete-panneau">
    <h3>Groupes · {tableau.name}</h3>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>

  <div class="corps-panneau">
    <p class="muet petit">Rangez les articles du tableau par groupe : la pharmacie, groupe A, groupe B… Chaque article choisit son groupe dans sa fiche.</p>

    <div class="liste">
      {#each duTableau as g, i (g.id)}
        {@const n = articles.filter((a) => a.groupId === g.id).length}
        <div class="ligne">
          {#if edition?.id === g.id}
            <div class="edition">
              <input bind:value={edition.nom} maxlength="60" aria-label="Nom du groupe" />
              <ChoixCouleur bind:valeur={edition.couleur} couleurs={COULEURS} taille={22} />
              <div class="actions">
                <button onclick={() => (edition = null)}>Annuler</button>
                <button
                  class="primaire"
                  disabled={envoi || !edition.nom.trim()}
                  onclick={() =>
                    faire(async () => {
                      await api(`/stock/groups/${g.id}`, { method: 'PATCH', body: JSON.stringify({ name: edition!.nom.trim(), color: edition!.couleur }) });
                      edition = null;
                    })}>Enregistrer</button
                >
              </div>
            </div>
          {:else}
            <span class="ordre">
              <button aria-label="Monter" disabled={i === 0 || envoi} onclick={() => deplacer(i, -1)}>↑</button>
              <button aria-label="Descendre" disabled={i === duTableau.length - 1 || envoi} onclick={() => deplacer(i, 1)}>↓</button>
            </span>
            <i class="point" style:background={g.color}></i>
            <span class="nom"><b>{g.name}</b><span class="muet">{n} article{n > 1 ? 's' : ''}</span></span>
            <button class="lien" onclick={() => (edition = { id: g.id, nom: g.name, couleur: g.color })}>Modifier</button>
            {#if aSupprimer === g.id}
              <button class="danger" disabled={envoi} onclick={() => faire(() => api(`/stock/groups/${g.id}`, { method: 'DELETE' }))}>Supprimer pour de bon</button>
            {:else}
              <button class="lien danger" title="Ses articles restent, sans groupe" onclick={() => (aSupprimer = g.id)}>Supprimer</button>
            {/if}
          {/if}
        </div>
      {:else}
        <p class="muet petit vide">Aucun groupe dans ce tableau.</p>
      {/each}
    </div>

    <form class="nouveau" onsubmit={creer}>
      <input bind:value={nom} maxlength="60" placeholder="Nouveau groupe : Groupe A — Douleur et fièvre" aria-label="Nom du nouveau groupe" />
      <ChoixCouleur bind:valeur={couleur} couleurs={COULEURS} taille={22} />
      <button type="submit" class="primaire rond" aria-label="Créer le groupe" title="Créer le groupe" disabled={envoi || !nom.trim()}>
        <Icone nom="plus" taille={20} />
      </button>
    </form>

    {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  </div>
</div>

<style>
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
    width: min(480px, 100vw);
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
    padding: 14px 20px;
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
    gap: 14px;
  }

  .petit {
    font-size: 13px;
    margin: 0;
  }

  .liste {
    border: 1px solid var(--trait);
    border-radius: 12px;
    overflow: hidden;
  }

  .ligne {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-top: 1px solid var(--trait);
  }

  .ligne:first-child {
    border-top: none;
  }

  .ordre {
    display: flex;
    flex-direction: column;
  }

  .ordre button {
    min-height: 0;
    height: 18px;
    width: 24px;
    padding: 0;
    border: none;
    font-size: 12px;
  }

  .point {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .nom {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 14px;
  }

  .nom .muet {
    font-size: 12px;
  }

  .edition {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
    font-size: 13px;
  }

  .danger {
    color: #b91c1c;
  }

  .vide {
    padding: 12px;
  }

  .nouveau {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nouveau .rond {
    align-self: flex-end;
    width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
