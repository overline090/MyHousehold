<script lang="ts">
  import { ICONES, texteValide, type SorteDIcone } from './icones';

  /**
   * Choisir une icône : aucune, une de la liste, « Perso » (un emoji ou
   * une à deux lettres), et, pour le stock, une image importée.
   */
  let {
    sorte = $bindable(),
    icone = $bindable(),
    texte = $bindable(),
    onImporter,
  }: { sorte: SorteDIcone; icone: string; texte: string; onImporter?: () => void } = $props();

  const invalide = $derived(sorte === 'perso' && texte.trim() !== '' && !texteValide(texte.trim()));
</script>

<div class="segment">
  <button type="button" class:actif={sorte === 'aucune'} onclick={() => (sorte = 'aucune')}>Aucune</button>
  <button type="button" class:actif={sorte === 'icone'} onclick={() => (sorte = 'icone')}>Icône</button>
  <button type="button" class:actif={sorte === 'perso'} onclick={() => (sorte = 'perso')}>Perso</button>
  {#if onImporter}
    <button type="button" class:actif={sorte === 'image'} onclick={() => ((sorte = 'image'), onImporter())}>Image</button>
  {/if}
</div>

{#if sorte === 'icone'}
  <div class="icones">
    {#each Object.entries(ICONES) as [cle, trace] (cle)}
      <button type="button" class:actif={icone === cle} aria-label={cle} onclick={() => (icone = cle)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html trace}</svg>
      </button>
    {/each}
  </div>
{:else if sorte === 'perso'}
  <label class="perso">
    Emoji ou lettres
    <input bind:value={texte} maxlength="16" placeholder="🍝" aria-invalid={invalide} />
  </label>
  <span class="aide" class:erreur={invalide}>
    {invalide ? 'Un seul emoji, ou une à deux lettres.' : 'Un emoji, ou une à deux lettres (« PR », « 3 »). Il s’affiche sur la couleur.'}
  </span>
{/if}

<style>
  .segment {
    display: flex;
    border: 1px solid var(--trait-net);
    border-radius: 10px;
    overflow: hidden;
  }

  .segment button {
    flex: 1;
    border: none;
    border-radius: 0;
    min-height: 38px;
    font-size: 13px;
  }

  .segment button + button {
    border-left: 1px solid var(--trait-net);
  }

  .segment button.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  .icones {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
  }

  .icones button {
    min-height: 38px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icones button.actif {
    border: 2px solid var(--accent);
    background: var(--accent-doux);
    color: var(--accent-sombre);
  }

  .perso {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .perso input {
    font-size: 20px;
  }

  .aide {
    font-size: 12px;
    font-weight: 400;
    color: var(--gris);
  }

  .aide.erreur {
    color: #b91c1c;
  }
</style>
