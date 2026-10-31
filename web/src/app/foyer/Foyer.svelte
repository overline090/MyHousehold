<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { barre } from '../../lib/barre.svelte';
  import { api, session } from '../../lib/session.svelte';
  import { jourDans } from '../accueil/donnees';
  import Photo from '../Photo.svelte';

  /**
   * Le foyer : ses membres, ce qui a été fait ce mois-ci par groupe, et
   * ses réglages en lecture. Des faits, pas un classement.
   */
  interface Membre {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    avatarUrl: string | null;
    avatarColor?: string;
    status: { id: string; name: string };
  }
  interface Contributions {
    month: string;
    total: number;
    byMember: { userId: string; count: number }[];
    byGroup: { id: string | null; name: string | null; color: string | null; count: number }[];
  }

  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');
  const aujourdHui = $derived(jourDans(fuseau));

  let membres = $state<Membre[]>([]);
  let contributions = $state<Contributions | null>(null);
  let tachesActives = $state<number | null>(null);
  let erreur = $state<string | null>(null);

  async function charger() {
    try {
      const [m, c, t] = await Promise.all([
        api<Membre[]>('/members'),
        api<Contributions>('/contributions'),
        api<{ id: string }[]>('/tasks?isActive=true'),
      ]);
      membres = m;
      contributions = c;
      tachesActives = t.length;
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void barre.rafraichir;
    void charger();
  });

  function faites(id: string): number {
    return contributions?.byMember.find((m) => m.userId === id)?.count ?? 0;
  }

  /** « 11 ans · anniversaire le 30 » quand l'anniversaire tombe ce mois-ci. */
  function age(naissance: string | null): string | null {
    if (!naissance) return null;
    const [a, m, j] = naissance.slice(0, 10).split('-').map(Number);
    const [aa, mm, jj] = aujourdHui.split('-').map(Number);
    let ans = aa - a;
    if (mm < m || (mm === m && jj < j)) ans -= 1;
    const texte = `${ans} an${ans > 1 ? 's' : ''}`;
    if (mm === m && jj < j) return `${texte} · anniversaire le ${j === 1 ? '1er' : j}`;
    if (mm === m && jj === j) return `${texte} · anniversaire aujourd’hui`;
    return texte;
  }

  const maximum = $derived(Math.max(1, ...(contributions?.byGroup.map((g) => g.count) ?? [1])));
  const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
</script>

{#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

<div class="membres">
  {#each membres as m (m.id)}
    {@const n = faites(m.id)}
    <article class="membre">
      <Photo membre={m} taille={84} />
      <h3>{m.firstName} {m.lastName}</h3>
      <span class="statut">{m.status.name}</span>
      {#if age(m.birthDate)}<span class="muet">{age(m.birthDate)}</span>{/if}
      <p><b>{n}</b> {n > 1 ? 'tâches faites' : 'tâche faite'} ce mois</p>
    </article>
  {/each}
</div>

<div class="deux">
  <section>
    <h2>Ce mois-ci, par groupe</h2>
    <div class="carte groupes">
      {#each contributions?.byGroup ?? [] as g (g.id ?? 'aucun')}
        <div class="groupe">
          <span class="nom">{g.name ?? 'Sans groupe'}</span>
          <span class="barre"><i style:width="{(g.count / maximum) * 100}%" style:background={g.color ?? '#94a3b8'}></i></span>
          <b>{g.count}</b>
        </div>
      {:else}
        <p class="muet">Rien de fait ce mois-ci pour l’instant.</p>
      {/each}
    </div>
  </section>
  <section>
    <h2>Le foyer</h2>
    <div class="carte reglages">
      <div><span>Fuseau horaire</span><span class="muet">{session.foyer?.timezone ?? '—'}</span></div>
      <div><span>La semaine commence</span><span class="muet">le {JOURS[session.foyer?.weekStartsOn ?? 1]}</span></div>
      <div><span>Tâches actives</span><span class="muet">{tachesActives ?? '…'}</span></div>
      <p class="muet petit">Ces réglages se changent dans Administration › Réglages du foyer.</p>
    </div>
  </section>
</div>

<p class="muet petit">
  Des faits, pas un classement : chacun voit ce qu’il a fait, et le foyer ce qui a été fait — sans points ni
  palmarès.
</p>

<style>
  .membres {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .membre {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  .membre h3 {
    font-size: 16px;
    margin-top: 6px;
  }

  .statut {
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--trait-net);
    border-radius: 999px;
    padding: 2px 10px;
    color: var(--encre-douce);
  }

  .membre p {
    margin: 4px 0 0;
  }

  .deux {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 24px;
    margin-bottom: 18px;
  }

  @media (max-width: 900px) {
    .deux {
      grid-template-columns: 1fr;
    }
  }

  h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
    margin-bottom: 8px;
  }

  .carte {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .groupe {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .groupe .nom {
    flex: 0 0 130px;
  }

  .barre {
    flex: 1;
    height: 10px;
    border-radius: 999px;
    background: var(--trait);
    overflow: hidden;
  }

  .barre i {
    display: block;
    height: 100%;
    border-radius: 999px;
  }

  .groupe b {
    flex: 0 0 32px;
    text-align: right;
  }

  .reglages div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .petit {
    font-size: 13px;
    margin: 0;
  }
</style>
