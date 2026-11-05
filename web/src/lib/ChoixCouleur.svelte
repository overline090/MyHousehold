<script lang="ts">
  /**
   * Choisir une couleur : celles proposées, ou une autre avec « + », qui
   * ouvre le sélecteur du navigateur. Une couleur personnalisée prend
   * place dans la rangée, à côté des autres.
   */
  let {
    valeur = $bindable(),
    couleurs,
    taille = 26,
    libelle = 'Couleur',
  }: { valeur: string; couleurs: string[]; taille?: number; libelle?: string } = $props();

  const egal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const perso = $derived(valeur && !couleurs.some((c) => egal(c, valeur)) ? valeur : null);
</script>

<div class="couleurs" role="radiogroup" aria-label={libelle} style:--taille="{taille}px">
  {#each couleurs as c (c)}
    <button
      type="button"
      role="radio"
      aria-checked={egal(c, valeur)}
      aria-label={c}
      class:actif={egal(c, valeur)}
      style:background={c}
      onclick={() => (valeur = c)}
    ></button>
  {/each}
  {#if perso}
    <button type="button" role="radio" aria-checked="true" aria-label={perso} class="actif" style:background={perso}></button>
  {/if}
  <label class="plus" title="Couleur personnalisée">
    <input
      type="color"
      aria-label="Couleur personnalisée"
      value={/^#[0-9a-f]{6}$/i.test(valeur) ? valeur.toLowerCase() : '#0f766e'}
      oninput={(e) => (valeur = (e.currentTarget as HTMLInputElement).value.toUpperCase())}
    />
  </label>
</div>

<style>
  .couleurs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }

  button,
  .plus {
    width: var(--taille);
    height: var(--taille);
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--surface);
    box-shadow: 0 0 0 1px var(--trait-net);
    cursor: pointer;
  }

  button.actif {
    box-shadow: 0 0 0 2px var(--encre);
  }

  .plus {
    position: relative;
    background: conic-gradient(#ef4444, #f59e0b, #84cc16, #10b981, #06b6d4, #6366f1, #d946ef, #ef4444);
    display: inline-flex;
  }

  .plus::after {
    content: '+';
    position: absolute;
    inset: 20%;
    border-radius: 50%;
    background: var(--surface);
    color: var(--encre);
    font-weight: 700;
    font-size: calc(var(--taille) * 0.5);
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .plus input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
    border: none;
    padding: 0;
  }
</style>
