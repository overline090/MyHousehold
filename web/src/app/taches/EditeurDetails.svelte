<script lang="ts">
  import { onMount } from 'svelte';
  import { detecter, resume } from '../../lib/detection';
  import { session } from '../../lib/session.svelte';

  /**
   * Écrire les détails d'une tâche : gras, italique, souligné, barré,
   * couleur, surligneur, listes et cases. Le texte prend une couleur de
   * la palette ou une autre (« + ») ; le surligneur garde sa palette, pour
   * que le texte reste lisible dessus.
   */
  let { valeur = $bindable(''), desactive = false }: { valeur: string; desactive?: boolean } = $props();

  const COULEURS = ['#111827', '#b91c1c', '#b45309', '#15803d', '#1d4ed8', '#7c3aed'];
  const SURLIGNEURS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e5e7eb'];

  let zone = $state<HTMLDivElement>();
  let palette = $state<'texte' | 'surligneur' | null>(null);
  let couleur = $state(COULEURS[1]);
  let surligneur = $state(SURLIGNEURS[0]);
  let actifs = $state<Record<string, boolean>>({});
  let texte = $state('');

  const trouvailles = $derived(resume(detecter(texte, session.foyer?.detection ?? {})));

  onMount(() => {
    if (zone) {
      zone.innerHTML = valeur ?? '';
      texte = zone.innerText;
    }
  });

  function relire() {
    if (!zone) return;
    valeur = zone.innerHTML;
    texte = zone.innerText;
    etats();
  }

  function etats() {
    actifs = Object.fromEntries(
      ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].map((c) => [
        c,
        document.queryCommandState(c),
      ]),
    );
  }

  function faire(commande: string, argument?: string) {
    zone?.focus();
    document.execCommand(commande, false, argument);
    relire();
  }

  /** Une liste de cases : une liste à puces dont chaque élément porte sa case. */
  function cases() {
    zone?.focus();
    const dejaListe = document.queryCommandState('insertUnorderedList');
    if (!dejaListe) document.execCommand('insertUnorderedList');
    const selection = window.getSelection();
    const noeud = selection?.anchorNode;
    const element = noeud instanceof Element ? noeud : noeud?.parentElement;
    const liste = element?.closest('ul');
    if (liste && zone?.contains(liste)) {
      const enCases = liste.querySelector('li[data-case]') !== null;
      liste.querySelectorAll('li').forEach((li) => {
        if (enCases) delete li.dataset.case;
        else li.dataset.case = li.dataset.case ?? 'non';
      });
    }
    relire();
  }

  function choisirCouleur(c: string) {
    couleur = c;
    palette = null;
    faire('foreColor', c);
  }

  /** Le sélecteur du navigateur prend le focus : on garde la sélection pour la lui rendre. */
  let selectionGardee: Range | null = null;

  function garderSelection() {
    const sel = window.getSelection();
    selectionGardee = sel && sel.rangeCount && zone?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  }

  function couleurPerso(c: string) {
    const sel = window.getSelection();
    if (selectionGardee && sel) {
      zone?.focus();
      sel.removeAllRanges();
      sel.addRange(selectionGardee);
    }
    choisirCouleur(c.toLowerCase());
  }

  function choisirSurligneur(c: string) {
    surligneur = c;
    palette = null;
    faire('hiliteColor', c);
  }

  /** Coller du texte brut : une page web collée apporterait sa mise en page. */
  function coller(e: ClipboardEvent) {
    e.preventDefault();
    const brut = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, brut);
    relire();
  }

  function raccourcis(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i' || k === 'u') {
      e.preventDefault();
      faire(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
    }
  }
</script>

<svelte:document onselectionchange={() => zone && document.activeElement === zone && etats()} />

<div class="editeur" class:desactive>
  <div class="outils" role="toolbar" aria-label="Mise en forme">
    <button type="button" class:actif={actifs.bold} aria-label="Gras" title="Gras (Ctrl+B)" onmousedown={(e) => e.preventDefault()} onclick={() => faire('bold')}><b>B</b></button>
    <button type="button" class:actif={actifs.italic} aria-label="Italique" title="Italique (Ctrl+I)" onmousedown={(e) => e.preventDefault()} onclick={() => faire('italic')}><i class="serif">I</i></button>
    <button type="button" class:actif={actifs.underline} aria-label="Souligné" title="Souligné (Ctrl+U)" onmousedown={(e) => e.preventDefault()} onclick={() => faire('underline')}><u>U</u></button>
    <button type="button" class:actif={actifs.strikeThrough} aria-label="Barré" title="Barré" onmousedown={(e) => e.preventDefault()} onclick={() => faire('strikeThrough')}><s>S</s></button>
    <span class="sep"></span>
    <span class="avec-palette">
      <button type="button" aria-label="Couleur du texte" title="Couleur du texte" onmousedown={(e) => e.preventDefault()} onclick={() => (palette = palette === 'texte' ? null : 'texte')}>
        A<small>▾</small><i class="pastille" style:background={couleur}></i>
      </button>
      {#if palette === 'texte'}
        <div class="palette" role="menu">
          <b>Couleur du texte</b>
          <div class="couleurs">
            {#each COULEURS as c (c)}
              <button type="button" role="menuitem" aria-label={c} class:actif={c === couleur} style:background={c} onmousedown={(e) => e.preventDefault()} onclick={() => choisirCouleur(c)}></button>
            {/each}
            {#if !COULEURS.includes(couleur)}
              <button type="button" role="menuitem" aria-label={couleur} class="actif" style:background={couleur} onmousedown={(e) => e.preventDefault()} onclick={() => choisirCouleur(couleur)}></button>
            {/if}
            <label class="plus" title="Couleur personnalisée">
              <input type="color" aria-label="Couleur personnalisée" value={couleur} onpointerdown={garderSelection} onchange={(e) => couleurPerso((e.currentTarget as HTMLInputElement).value)} />
            </label>
          </div>
        </div>
      {/if}
    </span>
    <span class="avec-palette">
      <button type="button" aria-label="Surligneur" title="Surligneur" onmousedown={(e) => e.preventDefault()} onclick={() => (palette = palette === 'surligneur' ? null : 'surligneur')}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h3l6-6" /><path d="m22 4-9.5 9.5-4-4L18 0" /></svg><small>▾</small><i class="pastille" style:background={surligneur}></i>
      </button>
      {#if palette === 'surligneur'}
        <div class="palette" role="menu">
          <b>Surligneur</b>
          <div class="couleurs">
            {#each SURLIGNEURS as c (c)}
              <button type="button" role="menuitem" aria-label={c} class:actif={c === surligneur} style:background={c} onmousedown={(e) => e.preventDefault()} onclick={() => choisirSurligneur(c)}></button>
            {/each}
          </div>
        </div>
      {/if}
    </span>
    <span class="sep"></span>
    <button type="button" class:actif={actifs.insertUnorderedList} aria-label="Liste à puces" title="Liste à puces" onmousedown={(e) => e.preventDefault()} onclick={() => faire('insertUnorderedList')}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
    </button>
    <button type="button" class:actif={actifs.insertOrderedList} aria-label="Liste numérotée" title="Liste numérotée" onmousedown={(e) => e.preventDefault()} onclick={() => faire('insertOrderedList')}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 6h10M10 12h10M10 18h10M4 4v4M3 18h3l-3 3h3" /></svg>
    </button>
    <button type="button" aria-label="Cases à cocher" title="Cases à cocher" onmousedown={(e) => e.preventDefault()} onclick={cases}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="7" rx="1.5" /><path d="m4.5 7.5 1.5 1.5 3-3M14 7h7M3 17h7M14 17h7" /></svg>
    </button>
    <span class="sep"></span>
    <button type="button" aria-label="Effacer la mise en forme" title="Effacer la mise en forme" onmousedown={(e) => e.preventDefault()} onclick={() => faire('removeFormat')}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4h11M12 4 8 20M4 20l16-16" /></svg>
    </button>
  </div>
  <div
    class="zone"
    bind:this={zone}
    contenteditable={!desactive}
    role="textbox"
    aria-multiline="true"
    aria-label="Détails"
    tabindex="0"
    data-vide="Facultatif — un numéro, une adresse, un code…"
    oninput={relire}
    onpaste={coller}
    onkeydown={raccourcis}
    onfocus={() => (palette = null)}
  ></div>
</div>
{#if trouvailles.length}
  <div class="detections">{#each trouvailles as t (t)}<span>{t}</span>{/each}</div>
{/if}

<style>
  .editeur {
    border: 1px solid var(--trait-net);
    border-radius: 10px;
    background: var(--surface);
    font-weight: 400;
    color: var(--encre);
  }

  .editeur:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
  }

  .desactive {
    opacity: 0.7;
  }

  .outils {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    border-bottom: 1px solid var(--trait);
    background: var(--surface-douce);
    border-radius: 10px 10px 0 0;
    flex-wrap: wrap;
  }

  .outils button {
    min-width: 30px;
    min-height: 30px;
    height: 30px;
    padding: 0 6px;
    border: none;
    border-radius: 7px;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 14px;
    color: var(--encre-douce);
    position: relative;
  }

  .outils button.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
  }

  .serif {
    font-family: Georgia, serif;
  }

  .sep {
    width: 1px;
    height: 20px;
    background: var(--trait-net);
    margin: 0 4px;
  }

  .avec-palette {
    position: relative;
  }

  .pastille {
    position: absolute;
    bottom: 4px;
    left: 50%;
    width: 14px;
    height: 4px;
    margin-left: -9px;
    border-radius: 2px;
  }

  .palette {
    position: absolute;
    z-index: 6;
    top: 34px;
    left: 0;
    background: var(--surface);
    border: 1px solid var(--trait-net);
    border-radius: 12px;
    padding: 10px;
    box-shadow: 0 12px 30px rgba(16, 23, 21, 0.18);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .palette b {
    font-size: 11px;
    color: var(--gris);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .couleurs {
    display: grid;
    grid-template-columns: repeat(6, 26px);
    gap: 6px;
  }

  .couleurs button {
    width: 26px;
    min-width: 0;
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

  .zone {
    min-height: 96px;
    max-height: 340px;
    overflow: auto;
    padding: 10px 12px;
    font-size: 14px;
    line-height: 1.55;
    outline: none;
    overflow-wrap: anywhere;
  }

  .zone:empty::before {
    content: attr(data-vide);
    color: var(--gris);
  }

  .zone :global(ul),
  .zone :global(ol) {
    margin: 0;
    padding-left: 22px;
  }

  .zone :global(li[data-case])::marker {
    content: '☐  ';
  }

  .zone :global(li[data-case='oui'])::marker {
    content: '☑  ';
  }

  .zone :global(mark),
  .zone :global(span[style*='background']) {
    color: #1a1a1a;
  }

  .detections {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }

  .detections span {
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--trait-net);
    border-radius: 999px;
    padding: 2px 10px;
    color: var(--encre-douce);
    background: var(--surface);
  }
  .plus {
    position: relative;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: conic-gradient(#ef4444, #f59e0b, #84cc16, #10b981, #06b6d4, #6366f1, #d946ef, #ef4444);
    cursor: pointer;
  }

  .plus::after {
    content: '+';
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    background: var(--surface);
    font-size: 12px;
    font-weight: 700;
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
    padding: 0;
    border: none;
    cursor: pointer;
  }
</style>
