<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import { api } from '../../lib/session.svelte';
  import type { Article } from './donnees';

  /**
   * « Retirer » sur une ligne : combien, et une note facultative (pour qui,
   * pourquoi). Posé sous le bouton qui l'ouvre, sans quitter la liste.
   */
  let { article, ancre, onFermer, onRetire }: { article: Article; ancre: DOMRect; onFermer: () => void; onRetire: () => void } = $props();

  let combien = $state(1);
  let note = $state('');
  let envoi = $state(false);
  let erreur = $state<string | null>(null);
  let champ = $state<HTMLInputElement>();

  const LARGEUR = 340;
  const HAUTEUR = 300;
  // Sous le bouton, aligné à droite ; au-dessus s'il n'y a plus la place.
  const position = $derived({
    left: Math.max(12, Math.min(ancre.right - LARGEUR, window.innerWidth - LARGEUR - 12)),
    top: ancre.bottom + 8 + HAUTEUR > window.innerHeight ? Math.max(12, ancre.top - HAUTEUR - 8) : ancre.bottom + 8,
  });
  const passeSousLeMinimum = $derived(article.minimum !== null && !article.toBuy && article.quantity - combien < article.minimum);

  $effect(() => {
    champ?.focus();
  });

  async function retirer(e: SubmitEvent) {
    e.preventDefault();
    envoi = true;
    erreur = null;
    try {
      await api('/stock/out', {
        method: 'POST',
        body: JSON.stringify({ items: [{ id: article.id, quantity: combien }], note: note.trim() || undefined }),
      });
      onRetire();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
      envoi = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onFermer()} />

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<form class="pop" style:left="{position.left}px" style:top="{position.top}px" onsubmit={retirer} aria-label={`Retirer : ${article.name}`}>
  <div class="tete">
    <b>Retirer : {article.name}</b>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={16} /></button>
  </div>
  <div class="combien">
    <span class="muet">Combien</span>
    <button type="button" class="pm" aria-label="Un de moins" disabled={combien <= 1} onclick={() => (combien -= 1)}>−</button>
    <b class="nombre">{combien}</b>
    <button type="button" class="pm" aria-label="Un de plus" disabled={combien >= article.quantity} onclick={() => (combien += 1)}>+</button>
    <span class="muet">sur {article.quantity}</span>
  </div>
  <label>
    <span>Note <span class="muet">(facultative)</span></span>
    <input bind:this={champ} bind:value={note} maxlength="300" placeholder="Pour qui, pourquoi" />
  </label>
  {#if passeSousLeMinimum}<div class="avertissement">Passera sous le minimum : rejoint « À racheter ».</div>{/if}
  {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  <div class="boutons">
    <button type="button" onclick={onFermer}>Annuler</button>
    <button type="submit" class="primaire" disabled={envoi || article.quantity === 0}>Retirer</button>
  </div>
</form>

<style>
  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    border: none;
    border-radius: 0;
    background: transparent;
    min-height: 0;
  }

  .pop {
    position: fixed;
    z-index: 21;
    width: 340px;
    max-width: calc(100vw - 24px);
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(16, 23, 21, 0.18);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tete,
  .combien,
  .boutons {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tete b {
    flex: 1;
  }

  .fermer {
    width: 30px;
    min-height: 30px;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .combien > .muet:first-child {
    flex: 1;
  }

  .pm {
    width: 30px;
    min-height: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
  }

  .nombre {
    min-width: 24px;
    text-align: center;
    font-size: 16px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  label .muet {
    font-weight: 400;
  }

  .avertissement {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    color: #9a3412;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px;
  }

  .boutons {
    justify-content: flex-end;
  }
</style>
