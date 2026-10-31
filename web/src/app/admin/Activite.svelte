<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { api, session } from '../../lib/session.svelte';
  import { jourDans, type Membre } from '../accueil/donnees';
  import { jourEnClair } from '../agenda/calendrier';
  import Photo from '../Photo.svelte';

  /** Administration › Activité : le journal du foyer, filtrable par sorte et par membre. */
  interface Entree {
    id: string;
    verb: string;
    summary: string;
    createdAt: string;
    actor: { id: string; firstName: string; lastName: string; avatarColor?: string } | null;
  }
  type Filtre = 'tout' | 'taches' | 'rdv' | 'stock' | 'membres';
  const FILTRES: [Filtre, string][] = [
    ['tout', 'Tout'],
    ['taches', 'Tâches'],
    ['rdv', 'Rendez-vous'],
    ['stock', 'Stock'],
    ['membres', 'Membres'],
  ];

  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');
  const aujourdHui = $derived(jourDans(fuseau));

  let entrees = $state<Entree[]>([]);
  let suite = $state<string | null>(null);
  let filtre = $state<Filtre>('tout');
  let qui = $state('');
  let membres = $state<Membre[]>([]);
  let erreur = $state<string | null>(null);

  async function charger(depuis: string | null = null) {
    try {
      const page = await api<{ data: Entree[]; nextCursor: string | null }>(
        `/activity?limit=100${depuis ? `&cursor=${depuis}` : ''}${qui ? `&actorId=${qui}` : ''}`,
      );
      entrees = depuis ? [...entrees, ...page.data] : page.data;
      suite = page.nextCursor;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void qui;
    void charger();
  });

  $effect(() => {
    void api<Membre[]>('/members').then((m) => (membres = m)).catch(() => {});
  });

  function sorte(verbe: string): Filtre {
    if (verbe.startsWith('TASK') || verbe.startsWith('BACKGROUND')) return 'taches';
    if (verbe.startsWith('APPOINTMENT')) return 'rdv';
    if (verbe.startsWith('STOCK')) return 'stock';
    return 'membres';
  }

  const visibles = $derived(entrees.filter((e) => filtre === 'tout' || sorte(e.verb) === filtre));
  const parJour = $derived.by(() => {
    const groupes: { jour: string; entrees: Entree[] }[] = [];
    for (const e of visibles) {
      const jour = jourDans(fuseau, new Date(e.createdAt));
      if (groupes.at(-1)?.jour !== jour) groupes.push({ jour, entrees: [] });
      groupes.at(-1)!.entrees.push(e);
    }
    return groupes;
  });

  function titreDuJour(jour: string): string {
    if (jour === aujourdHui) return 'Aujourd’hui';
    const hier = new Date(`${aujourdHui}T12:00:00Z`);
    hier.setUTCDate(hier.getUTCDate() - 1);
    if (jour === hier.toISOString().slice(0, 10)) return 'Hier';
    return jourEnClair(jour);
  }

  function heure(iso: string): string {
    const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
    return `${Number(h)} h ${m}`;
  }
</script>

<div class="outils">
  <div class="filtres" role="group" aria-label="Sorte">
    {#each FILTRES as [v, libelle] (v)}
      <button class:actif={filtre === v} onclick={() => (filtre = v)}>{libelle}</button>
    {/each}
  </div>
  <select bind:value={qui} aria-label="Membre">
    <option value="">Tout le monde</option>
    {#each membres as m (m.id)}<option value={m.id}>{m.firstName} {m.lastName}</option>{/each}
  </select>
</div>

{#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

<div class="journal">
  {#each parJour as g (g.jour)}
    <div class="jour">{titreDuJour(g.jour)}</div>
    {#each g.entrees as e (e.id)}
      <div class="entree">
        <span class="heure muet">{heure(e.createdAt)}</span>
        {#if e.actor}<Photo membre={{ ...e.actor, avatarUrl: null }} taille={30} />{/if}
        <span><b>{e.actor?.firstName ?? 'Quelqu’un'}</b> {e.summary}</span>
      </div>
    {/each}
  {:else}
    <p class="muet vide">Rien pour l’instant.</p>
  {/each}
</div>
{#if suite}<button class="plus" onclick={() => charger(suite)}>Voir plus ancien</button>{/if}

<style>
  .outils {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 14px;
  }

  .filtres {
    flex: 1;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filtres button {
    min-height: 36px;
    border-radius: 999px;
    padding: 0 14px;
  }

  .filtres button.actif {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  select {
    width: auto;
  }

  .journal {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    overflow: hidden;
  }

  .jour {
    background: var(--surface-douce);
    padding: 8px 18px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
    border-top: 1px solid var(--trait);
  }

  .jour:first-child {
    border-top: none;
  }

  .entree {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border-top: 1px solid var(--trait);
  }

  .heure {
    flex: 0 0 60px;
    font-size: 13px;
  }

  .vide {
    padding: 16px 18px;
  }

  .plus {
    margin-top: 12px;
  }
</style>
