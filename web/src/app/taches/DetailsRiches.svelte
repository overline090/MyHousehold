<script lang="ts">
  import { detecter, type Trouvaille } from '../../lib/detection';
  import { session } from '../../lib/session.svelte';

  /**
   * Les détails d'une tâche, à lire et à utiliser : un appui sur un
   * numéro propose d'appeler ou de copier, sur une adresse de l'ouvrir
   * dans la carte, sur un code reconnu par une règle de le copier.
   *
   * Le HTML vient du serveur, qui n'en garde que la mise en forme
   * permise ; la détection se fait ici, sur le texte affiché.
   */
  let {
    html,
    onCase,
  }: {
    html: string;
    /** Cocher ou décocher une case de la liste ; absent : les cases sont en lecture seule. */
    onCase?: (index: number, cochee: boolean) => void;
  } = $props();

  let zone = $state<HTMLElement>();
  let bulle = $state<{ t: Trouvaille; texte: string; x: number; y: number } | null>(null);
  let message = $state<string | null>(null);
  let minuterie: ReturnType<typeof setTimeout> | undefined;

  function annoncer(texte: string) {
    message = texte;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => (message = null), 2200);
  }

  async function copier(valeur: string) {
    try {
      await navigator.clipboard.writeText(valeur);
      annoncer(`« ${valeur} » copié`);
    } catch {
      annoncer('Copie impossible dans ce navigateur.');
    }
    bulle = null;
  }

  /** Entoure ce qui est reconnu, nœud de texte par nœud de texte. */
  function marquer(racine: HTMLElement) {
    const reglages = session.foyer?.detection ?? {};
    const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    const noeuds: Text[] = [];
    for (let n = parcours.nextNode(); n; n = parcours.nextNode()) noeuds.push(n as Text);

    for (const noeud of noeuds) {
      const texte = noeud.data;
      const trouvailles = detecter(texte, reglages);
      if (!trouvailles.length) continue;
      const morceaux = document.createDocumentFragment();
      let curseur = 0;
      for (const t of trouvailles) {
        morceaux.append(texte.slice(curseur, t.debut));
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = `detecte ${t.sorte}`;
        bouton.textContent = texte.slice(t.debut, t.fin);
        bouton.title =
          t.sorte === 'copie'
            ? `${t.nom} — un appui le copie`
            : t.sorte === 'telephone'
              ? 'Appeler ou copier'
              : t.sorte === 'adresse'
                ? 'Ouvrir dans la carte ou copier'
                : 'Ouvrir ou copier';
        bouton.addEventListener('click', (e) => {
          e.stopPropagation();
          if (t.sorte === 'copie') {
            void copier(t.valeur);
            return;
          }
          const r = bouton.getBoundingClientRect();
          const parent = racine.getBoundingClientRect();
          bulle = { t, texte: bouton.textContent ?? t.valeur, x: r.left - parent.left, y: r.top - parent.top };
        });
        morceaux.append(bouton);
        curseur = t.fin;
      }
      morceaux.append(texte.slice(curseur));
      noeud.replaceWith(morceaux);
    }

    // Les cases à cocher des listes.
    racine.querySelectorAll<HTMLLIElement>('li[data-case]').forEach((li, index) => {
      const cochee = li.dataset.case === 'oui';
      const caseACocher = document.createElement('input');
      caseACocher.type = 'checkbox';
      caseACocher.checked = cochee;
      caseACocher.disabled = !onCase;
      caseACocher.setAttribute('aria-label', cochee ? 'Décocher' : 'Cocher');
      caseACocher.addEventListener('change', () => onCase?.(index, caseACocher.checked));
      li.prepend(caseACocher);
    });
  }

  $effect(() => {
    if (!zone) return;
    zone.innerHTML = html;
    marquer(zone);
  });

  function carte(adresse: string): string {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(adresse)}`;
  }
</script>

<svelte:window onclick={() => (bulle = null)} />

<div class="details">
  <div class="texte-riche" bind:this={zone}></div>

  {#if bulle}
    {@const t = bulle.t}
    <div class="bulle" style:left="{Math.max(0, bulle.x - 20)}px" style:top="{bulle.y - 46}px" role="menu">
      <span class="titre">{bulle.texte}</span>
      {#if t.sorte === 'telephone'}
        <a role="menuitem" href="tel:{t.valeur}">☎ Appeler</a>
      {:else if t.sorte === 'adresse'}
        <a role="menuitem" href={carte(t.valeur)} target="_blank" rel="noopener noreferrer">⌖ Ouvrir dans la carte</a>
      {:else}
        <a role="menuitem" href={t.valeur} target="_blank" rel="noopener noreferrer">↗ Ouvrir</a>
      {/if}
      <button type="button" role="menuitem" onclick={() => copier(t.valeur)}>⧉ Copier</button>
    </div>
  {/if}

  {#if message}<div class="toast" role="status">{message}</div>{/if}
</div>

<style>
  .details {
    position: relative;
  }

  .texte-riche {
    font-size: 14px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .texte-riche :global(p) {
    margin: 0 0 4px;
  }

  .texte-riche :global(ul),
  .texte-riche :global(ol) {
    margin: 0 0 4px;
    padding-left: 22px;
  }

  .texte-riche :global(li[data-case]) {
    list-style: none;
    margin-left: -20px;
  }

  .texte-riche :global(li[data-case] input) {
    margin: 0 8px 0 0;
    vertical-align: -2px;
    width: auto;
    min-height: 0;
  }

  .texte-riche :global(li[data-case='oui']) {
    color: var(--gris);
    text-decoration: line-through;
  }

  .texte-riche :global(mark) {
    color: #1a1a1a;
    border-radius: 2px;
    padding: 0 1px;
  }

  .texte-riche :global(button.detecte) {
    all: unset;
    cursor: pointer;
    color: var(--accent-sombre);
    text-decoration: underline dotted 1.5px;
    text-underline-offset: 3px;
  }

  .texte-riche :global(button.detecte.copie) {
    text-decoration: none;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    font-weight: 600;
    background: var(--accent-doux);
    border: 1px solid var(--accent-trait);
    border-radius: 6px;
    padding: 0 6px;
  }

  .texte-riche :global(button.detecte.copie)::after {
    content: ' ⧉';
    font-size: 11px;
  }

  .texte-riche :global(button.detecte:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .bulle {
    position: absolute;
    z-index: 5;
    background: #1c2624;
    color: #fff;
    border-radius: 12px;
    padding: 5px;
    display: flex;
    gap: 2px;
    box-shadow: 0 12px 30px rgba(16, 23, 21, 0.25);
    font-size: 13px;
    white-space: nowrap;
  }

  .bulle .titre {
    color: #a7b3b0;
    font-size: 12px;
    padding: 6px 8px;
  }

  .bulle a,
  .bulle button {
    color: #fff;
    background: transparent;
    border: none;
    min-height: 0;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 13px;
    text-decoration: none;
  }

  .bulle a:hover,
  .bulle button:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .toast {
    position: fixed;
    z-index: 30;
    left: 50%;
    bottom: 32px;
    transform: translateX(-50%);
    background: #1c2624;
    color: #fff;
    border-radius: 999px;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 10px 26px rgba(16, 23, 21, 0.25);
  }
</style>
