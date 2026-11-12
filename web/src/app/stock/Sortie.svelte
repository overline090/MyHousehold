<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import { api } from '../../lib/session.svelte';
  import { imageDeLArticle, type Article, type Tableau } from './donnees';
  import Vignette from './Vignette.svelte';

  /** Déclarer une sortie : on coche ce qu'on a pris, combien, et tout part d'un coup. */
  let {
    tableaux,
    articles,
    tableauId,
    onFermer,
    onValide,
  }: {
    tableaux: Tableau[];
    articles: Article[];
    tableauId: string | null;
    onFermer: () => void;
    onValide: () => void;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  let choisi = $state(tableauId ?? tableaux[0]?.id ?? null);
  let pris = $state<Record<string, number>>({});
  let note = $state('');
  let erreur = $state<string | null>(null);
  let envoi = $state(false);

  const duTableau = $derived(articles.filter((a) => a.boardId === choisi));
  const lignes = $derived(Object.entries(pris).filter(([, q]) => q > 0));
  const unites = $derived(lignes.reduce((s, [, q]) => s + q, 0));
  const sousLeMinimum = $derived(
    lignes
      .map(([id, q]) => ({ a: articles.find((x) => x.id === id)!, q }))
      .filter(({ a, q }) => a && a.minimum !== null && !a.toBuy && a.quantity - q < a.minimum)
      .map(({ a }) => a.name),
  );

  function cocher(a: Article, oui: boolean) {
    if (oui) pris[a.id] = 1;
    else delete pris[a.id];
  }

  function changer(a: Article, delta: number) {
    const q = (pris[a.id] ?? 0) + delta;
    if (q <= 0) delete pris[a.id];
    else pris[a.id] = Math.min(q, Math.max(a.quantity, 1));
  }

  async function valider() {
    envoi = true;
    erreur = null;
    try {
      await api('/stock/out', { method: 'POST', body: JSON.stringify({ items: lignes.map(([id, quantity]) => ({ id, quantity })), note: note.trim() || undefined }) });
      onValide();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
      envoi = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onFermer()} />

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<div class="panneau" role="dialog" aria-label="Déclarer une sortie">
  <div class="tete-panneau">
    <h3>Déclarer une sortie</h3>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>

  <div class="corps-panneau">
    <p class="muet petit">Cochez ce que vous avez pris, même dans plusieurs tableaux ; tout est retiré d’un coup.</p>
    {#if tableaux.length > 1}
      <div class="puces">
        {#each tableaux as t (t.id)}
          {@const n = articles.filter((a) => a.boardId === t.id && pris[a.id]).length}
          <button class:actif={choisi === t.id} onclick={() => (choisi = t.id)}>{t.name}{#if n}<b> · {n}</b>{/if}</button>
        {/each}
      </div>
    {/if}

    <div class="liste">
      {#each duTableau as a (a.id)}
        {@const q = pris[a.id] ?? 0}
        <div class="ligne" class:coche={q > 0}>
          <label>
            <input type="checkbox" checked={q > 0} disabled={a.quantity === 0} onchange={(e) => cocher(a, (e.currentTarget as HTMLInputElement).checked)} />
            <Vignette icon={a.icon} color={a.color} image={imageDeLArticle(a)} taille={32} />
            <span class="nom"><b>{a.name}</b><span class="muet">en stock : {a.quantity}</span></span>
          </label>
          {#if q > 0}
            <span class="compteur">
              <button aria-label={`Une de moins : ${a.name}`} onclick={() => changer(a, -1)}>−</button>
              <b>{q}</b>
              <button aria-label={`Une de plus : ${a.name}`} disabled={q >= a.quantity} onclick={() => changer(a, 1)}>+</button>
            </span>
          {/if}
        </div>
      {:else}
        <p class="muet">Aucun article dans ce tableau.</p>
      {/each}
    </div>

    <label class="note">
      Note <span class="muet">(facultative : pour qui, pourquoi)</span>
      <input bind:value={note} maxlength="300" placeholder="Pour la fièvre de Lou" />
    </label>

    {#if sousLeMinimum.length}
      <div class="encadre avertissement">
        Passera sous le minimum, donc « À racheter » : {sousLeMinimum.join(', ')}.
      </div>
    {/if}
    {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  </div>

  <div class="pied-panneau">
    <span class="muet resume">{lignes.length} article{lignes.length > 1 ? 's' : ''} · {unites} unité{unites > 1 ? 's' : ''}</span>
    <span class="espace"></span>
    <button type="button" onclick={onFermer}>Annuler</button>
    <button type="button" class="primaire" disabled={envoi || !lignes.length} onclick={valider}>Valider la sortie</button>
  </div>
</div>

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
    width: min(460px, 100vw);
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
    gap: 12px;
  }

  .pied-panneau {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--trait);
  }

  .espace {
    flex: 1;
  }

  .petit,
  .resume {
    font-size: 13px;
    margin: 0;
  }

  .puces {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .puces button {
    min-height: 34px;
    border-radius: 999px;
    padding: 0 14px;
    font-size: 13px;
  }

  .puces button.actif {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .liste {
    border: 1px solid var(--trait);
    border-radius: 12px;
    overflow: hidden;
  }

  .ligne {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-top: 1px solid var(--trait);
  }

  .ligne:first-child {
    border-top: none;
  }

  .ligne.coche {
    background: var(--accent-doux);
  }

  .ligne label {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    min-width: 0;
  }

  .ligne input {
    width: 18px;
    height: 18px;
    min-height: 0;
    accent-color: var(--accent);
  }

  .nom {
    display: flex;
    flex-direction: column;
    font-size: 14px;
  }

  .nom .muet {
    font-size: 12px;
  }

  .compteur {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .compteur button {
    width: 30px;
    height: 30px;
    min-height: 30px;
    padding: 0;
    border-radius: 8px;
  }

  .avertissement {
    background: #fff7ed;
    border-color: #fed7aa;
    color: #9a3412;
    font-size: 13px;
  }
  .note {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .note .muet {
    font-weight: 400;
  }
</style>
