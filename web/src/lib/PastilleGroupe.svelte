<script lang="ts">
  import { ICONES, encreSur, texteDeLIcone } from './icones';

  /** Le repère d'un groupe : son icône sur sa couleur, ou un simple point de couleur. */
  let { color, icon = null, taille = 18 }: { color: string; icon?: string | null; taille?: number } = $props();

  const texte = $derived(texteDeLIcone(icon));
  const trace = $derived(icon && !texte ? ICONES[icon] : null);
</script>

{#if texte || trace}
  <span class="pastille" style:background={color} style:width="{taille}px" style:height="{taille}px" aria-hidden="true">
    {#if texte}
      <span style:color={encreSur(color)} style:font-size="{taille * (/^[\p{L}\p{N}]+$/u.test(texte) ? 0.5 : 0.66)}px">{texte}</span>
    {:else}
      <svg viewBox="0 0 24 24" width={taille * 0.68} height={taille * 0.68} fill="none" stroke={encreSur(color)} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{@html trace}</svg>
    {/if}
  </span>
{:else}
  <i class="point" style:background={color} aria-hidden="true"></i>
{/if}

<style>
  .pastille {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 30%;
    font-weight: 700;
    line-height: 1;
    vertical-align: middle;
    overflow: hidden;
  }

  .point {
    flex: none;
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    vertical-align: middle;
  }
</style>
