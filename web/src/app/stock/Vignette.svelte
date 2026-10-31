<script lang="ts">
  import { imageProtegee } from '../../lib/session.svelte';
  import { ICONES_STOCK } from './icones';

  /** L'image d'un tableau ou d'un article : importée, une icône sur sa couleur, ou rien. */
  let {
    icon,
    color,
    image,
    taille = 36,
  }: { icon: string | null; color: string | null; image: string | null; taille?: number } = $props();

  let url = $state<string | null>(null);
  $effect(() => {
    url = null;
    if (!image) return;
    let annule = false;
    void imageProtegee(image).then((u) => {
      if (!annule) url = u;
    });
    return () => {
      annule = true;
    };
  });
</script>

<span
  class="vignette"
  class:vide={!icon && !image}
  style:width="{taille}px"
  style:height="{taille}px"
  style:background={image ? 'transparent' : icon ? (color ?? '#0F766E') : null}
>
  {#if image && url}
    <img src={url} alt="" />
  {:else if icon && ICONES_STOCK[icon]}
    <svg viewBox="0 0 24 24" width={taille * 0.55} height={taille * 0.55} fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html ICONES_STOCK[icon]}</svg>
  {:else}
    <svg viewBox="0 0 24 24" width={taille * 0.5} height={taille * 0.5} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html ICONES_STOCK.boite}</svg>
  {/if}
</span>

<style>
  .vignette {
    flex: none;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .vignette.vide {
    border: 1px dashed var(--trait-net);
    color: var(--gris);
    background: var(--surface-douce);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
