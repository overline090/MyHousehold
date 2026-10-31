<script lang="ts">
  import { aller, route } from '../../lib/route.svelte';
  import { aLeDroit } from '../../lib/session.svelte';
  import AVenir from '../AVenir.svelte';
  import CopieAutomatique from './CopieAutomatique.svelte';

  /**
   * L'administration : une page dédiée, avec sa navigation. Chaque
   * rubrique n'apparaît qu'à qui en a le droit — absente, pas grisée.
   */
  const RUBRIQUES = [
    { chemin: 'membres', libelle: 'Membres', droit: 'MANAGE_MEMBERS' },
    { chemin: 'statuts', libelle: 'Statuts et droits', droit: 'MANAGE_STATUSES' },
    { chemin: 'reglages', libelle: 'Réglages du foyer', droit: 'MANAGE_SERVER' },
    { chemin: 'serveur', libelle: 'Serveur', droit: 'MANAGE_SERVER' },
    { chemin: 'activite', libelle: 'Activité', droit: 'MANAGE_SERVER' },
    { chemin: 'plugins', libelle: 'Plugins', droit: 'MANAGE_SERVER' },
  ];

  const permises = $derived(RUBRIQUES.filter((r) => aLeDroit(r.droit)));
  // Réglages du foyer d'abord quand on y a droit : c'est la rubrique déjà écrite.
  const parDefaut = $derived(permises.find((r) => r.chemin === 'reglages') ?? permises[0]);
  const active = $derived(
    permises.find((r) => route.chemin.startsWith(`/administration/${r.chemin}`)) ?? parDefaut,
  );
</script>

<div class="admin">
  <nav class="sous-nav" aria-label="Administration">
    {#each permises as r (r.chemin)}
      <a
        href="/administration/{r.chemin}"
        class:actif={active?.chemin === r.chemin}
        aria-current={active?.chemin === r.chemin ? 'page' : undefined}
        onclick={(e) => {
          e.preventDefault();
          aller(`/administration/${r.chemin}`);
        }}>{r.libelle}</a
      >
    {/each}
  </nav>
  <div class="page">
    {#if !active}
      <p class="muet">Aucune rubrique d’administration pour ce compte.</p>
    {:else if active.chemin === 'reglages'}
      <CopieAutomatique />
    {:else}
      <AVenir nom={active.libelle} />
    {/if}
  </div>
</div>

<style>
  .admin {
    display: flex;
    gap: 24px;
    align-items: flex-start;
  }

  .sous-nav {
    flex: none;
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sous-nav a {
    display: flex;
    align-items: center;
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    color: var(--encre-douce);
    text-decoration: none;
    font-size: 14px;
  }

  .sous-nav a:hover {
    background: var(--surface);
  }

  .sous-nav a.actif {
    background: var(--surface);
    color: var(--accent-sombre);
    font-weight: 600;
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .page {
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 760px) {
    .admin {
      flex-direction: column;
    }

    .sous-nav {
      width: 100%;
      flex-direction: row;
      overflow-x: auto;
    }

    .sous-nav a {
      white-space: nowrap;
    }
  }
</style>
