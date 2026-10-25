<script lang="ts">
  import type { SetupStep } from '../lib/api';

  let { steps, courante }: { steps: SetupStep[]; courante: string } = $props();

  // Une étape non applicable est sautée : sur une installation Docker,
  // le réseau est déjà configuré, la page ne s'afficherait pas sinon.
  const visibles = $derived(steps.filter((e) => e.applicable));
  const numero = $derived(visibles.findIndex((e) => e.id === courante) + 1);
</script>

<div class="entete">
  <h1>Installation de MyHousehold</h1>
  <p class="muet">Étape {numero} sur {visibles.length}</p>
</div>

<ol class="etapes">
  {#each visibles as etape, index (etape.id)}
    <li class:faite={etape.done} class:courante={etape.id === courante}>
      <span class="pastille" aria-hidden="true">
        {#if etape.done}✓{:else}{index + 1}{/if}
      </span>
      <span class="libelle">{etape.label}</span>
      {#if index < visibles.length - 1}
        <span class="trait" class:franchi={etape.done} aria-hidden="true"></span>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .entete {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  h1 {
    font-size: 22px;
    font-weight: 600;
  }

  .etapes {
    display: flex;
    align-items: center;
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  li:last-child {
    flex: 0 0 auto;
  }

  .pastille {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--trait-net);
    background: var(--surface);
    color: var(--gris);
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  li.courante .pastille,
  li.faite .pastille {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
    font-weight: 600;
  }

  .libelle {
    font-size: 13px;
    color: var(--gris);
    white-space: nowrap;
  }

  li.courante .libelle {
    color: var(--encre);
    font-weight: 600;
  }

  .trait {
    flex: 1;
    height: 2px;
    background: var(--trait-net);
    margin: 0 12px;
    min-width: 12px;
  }

  .trait.franchi {
    background: var(--accent);
  }

  @media (max-width: 640px) {
    .etapes {
      flex-wrap: wrap;
      gap: 10px 16px;
    }

    li {
      flex: 0 0 auto;
    }

    .trait {
      display: none;
    }
  }
</style>
