<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import { api } from '../../lib/session.svelte';
  import { imageDuTableau, type Tableau } from './donnees';
  import { COULEURS_STOCK, ICONES_STOCK } from './icones';
  import Vignette from './Vignette.svelte';

  /** Créer ou modifier un tableau : son nom, son icône ou son image, sa couleur. */
  let {
    tableau,
    onFermer,
    onEnregistre,
  }: {
    tableau: Tableau | null;
    onFermer: () => void;
    onEnregistre: (id?: string) => void;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  const depart = tableau;
  let sorteImage = $state<'aucune' | 'icone' | 'image'>(depart?.hasImage ? 'image' : depart && !depart.icon ? 'aucune' : 'icone');
  let icone = $state(depart?.icon ?? 'panier');
  let couleur = $state(depart?.color ?? COULEURS_STOCK[0]);
  let fichier = $state<File | null>(null);
  let entree = $state<HTMLInputElement>();
  let nom = $state(depart?.name ?? '');
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  let confirmer = $state(false);

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    envoi = true;
    erreur = null;
    try {
      const t = await api<Tableau>(depart ? `/stock/boards/${depart.id}` : '/stock/boards', {
        method: depart ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: nom.trim(), icon: sorteImage === 'icone' ? icone : null, color: couleur }),
      });
      if (sorteImage === 'image' && fichier) {
        const f = new FormData();
        f.append('file', fichier);
        await api(`/stock/boards/${t.id}/image`, { method: 'PUT', body: f });
      } else if (sorteImage !== 'image' && depart?.hasImage) {
        await api(`/stock/boards/${t.id}/image`, { method: 'DELETE' });
      }
      onEnregistre(t.id);
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

  async function supprimer() {
    if (!depart) return;
    envoi = true;
    try {
      await api(`/stock/boards/${depart.id}`, { method: 'DELETE' });
      onEnregistre();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
      envoi = false;
    }
  }

  const apercu = $derived(fichier ? URL.createObjectURL(fichier) : null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onFermer()} />

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<form class="panneau" onsubmit={enregistrer} aria-label={depart ? depart.name : 'Nouveau tableau'}>
  <div class="tete-panneau">
    {#if apercu}
      <img class="apercu" src={apercu} alt="" />
    {:else}
      <Vignette icon={sorteImage === 'icone' ? icone : null} color={couleur} image={sorteImage === 'image' && depart ? imageDuTableau(depart) : null} taille={44} />
    {/if}
    <h3>{depart ? 'Modifier le tableau' : 'Nouveau tableau'}</h3>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>

  <div class="corps-panneau">
    <label>Nom<input bind:value={nom} required maxlength="60" placeholder="Garde-manger" /></label>

    <div class="champ">
      <span>Image</span>
      <div class="segment">
        <button type="button" class:actif={sorteImage === 'aucune'} onclick={() => (sorteImage = 'aucune')}>Aucune</button>
        <button type="button" class:actif={sorteImage === 'icone'} onclick={() => (sorteImage = 'icone')}>Icône</button>
        <button type="button" class:actif={sorteImage === 'image'} onclick={() => ((sorteImage = 'image'), entree?.click())}>Importer une image</button>
      </div>
      <input bind:this={entree} type="file" accept="image/*" hidden onchange={(e) => (fichier = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
      {#if sorteImage === 'icone'}
        <div class="icones">
          {#each Object.entries(ICONES_STOCK) as [cle, trace] (cle)}
            <button type="button" class:actif={icone === cle} aria-label={cle} onclick={() => (icone = cle)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html trace}</svg>
            </button>
          {/each}
        </div>
      {/if}
      {#if sorteImage !== 'image'}
        <div class="couleurs">
          {#each COULEURS_STOCK as c (c)}
            <button type="button" class:actif={couleur === c} style:background={c} aria-label={c} onclick={() => (couleur = c)}></button>
          {/each}
        </div>
      {/if}
    </div>

    {#if depart}
      <p class="muet petit">
        {depart.itemCount} article{depart.itemCount > 1 ? 's' : ''} dans ce tableau. Le supprimer supprime aussi ses articles.
      </p>
    {/if}

    {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  </div>

  <div class="pied-panneau">
    {#if depart}
      {#if confirmer}
        <button type="button" class="danger" disabled={envoi} onclick={supprimer}>Supprimer pour de bon</button>
      {:else}
        <button type="button" class="danger" onclick={() => (confirmer = true)}>Supprimer</button>
      {/if}
    {/if}
    <span class="espace"></span>
    <button type="button" onclick={onFermer}>Annuler</button>
    <button type="submit" class="primaire" disabled={envoi || !nom.trim()}>{depart ? 'Enregistrer' : 'Créer le tableau'}</button>
  </div>
</form>

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
    width: min(420px, 100vw);
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

  .apercu {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    object-fit: cover;
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

  .pied-panneau {
    display: flex;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--trait);
  }

  .espace {
    flex: 1;
  }

  .danger {
    color: #b91c1c;
  }

  .petit {
    font-size: 13px;
    margin: 0;
  }

  label,
  .champ {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

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
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }

  .icones button {
    min-height: 40px;
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

  .couleurs {
    display: flex;
    gap: 6px;
  }

  .couleurs button {
    width: 26px;
    height: 26px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--surface);
    box-shadow: 0 0 0 1px var(--trait-net);
  }

  .couleurs button.actif {
    box-shadow: 0 0 0 2px var(--encre);
  }
</style>
