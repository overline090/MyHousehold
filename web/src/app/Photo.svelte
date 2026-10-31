<script lang="ts">
  import { imageProtegee } from '../lib/session.svelte';

  /** La photo d'un membre, ou ses initiales sur sa couleur quand il n'en a pas. */
  let {
    membre,
    taille = 32,
  }: {
    membre: { firstName: string; lastName: string; avatarUrl?: string | null; avatarColor?: string };
    taille?: number;
  } = $props();

  let image = $state<string | null>(null);
  $effect(() => {
    const url = membre.avatarUrl;
    image = null;
    if (!url) return;
    let annule = false;
    void imageProtegee(url).then((u) => {
      if (!annule) image = u;
    });
    return () => {
      annule = true;
    };
  });

  const initiales = $derived(
    ((membre.firstName[0] ?? '') + (membre.lastName[0] ?? '')).toUpperCase() || '?',
  );
</script>

<span
  class="photo"
  style:width="{taille}px"
  style:height="{taille}px"
  style:font-size="{Math.round(taille / 2.6)}px"
  style:background={membre.avatarColor ?? 'linear-gradient(135deg,#0f766e,#14b8a6)'}
>
  {#if image}
    <img src={image} alt="" />
  {:else}
    {initiales}
  {/if}
</span>

<style>
  .photo {
    flex: none;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    overflow: hidden;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
