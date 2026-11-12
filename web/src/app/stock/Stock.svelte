<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { barre } from '../../lib/barre.svelte';
  import { aLeDroit, api, session } from '../../lib/session.svelte';
  import { jourDans } from '../accueil/donnees';
  import { imageDeLArticle, imageDuTableau, peremptionEnClair, type Article, type Groupe, type Tableau } from './donnees';
  import FicheArticle from './FicheArticle.svelte';
  import FicheTableau from './FicheTableau.svelte';
  import GroupesDuTableau from './GroupesDuTableau.svelte';
  import Retrait from './Retrait.svelte';
  import Sortie from './Sortie.svelte';
  import Vignette from './Vignette.svelte';

  /** Le plugin Gestion de stock : les tableaux, et les articles du tableau choisi, rangés par groupe. */
  const aujourdHui = $derived(jourDans(session.foyer?.timezone ?? 'Europe/Paris'));
  const peutGerer = $derived(aLeDroit('MANAGE_TASKS'));
  const peutFaire = $derived(aLeDroit('COMPLETE_TASKS'));

  let tableaux = $state<Tableau[]>([]);
  let articles = $state<Article[]>([]);
  let groupes = $state<Groupe[]>([]);
  let retrait = $state<{ article: Article; ancre: DOMRect } | null>(null);
  let gestionGroupes = $state(false);
  let choisi = $state<string | null>(null);
  let filtre = $state<'tout' | 'racheter' | 'perime'>('tout');
  let erreur = $state<string | null>(null);
  let fiche = $state<{ article: Article | null } | null>(null);
  let ficheTableau = $state<{ tableau: Tableau | null } | null>(null);
  let sortie = $state(false);

  async function charger() {
    try {
      const [t, a, g] = await Promise.all([
        api<Tableau[]>('/stock/boards'),
        api<Article[]>('/stock/items'),
        api<Groupe[]>('/stock/groups').catch(() => [] as Groupe[]),
      ]);
      tableaux = t;
      articles = a;
      groupes = g;
      if (!choisi || !t.some((x) => x.id === choisi)) choisi = t[0]?.id ?? null;
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void barre.rafraichir;
    void charger();
  });

  $effect(() => {
    barre.actions = boutons;
    barre.ajouter = peutGerer && choisi ? { libelle: 'Nouvel article', faire: () => (fiche = { article: null }) } : null;
    return () => {
      barre.actions = null;
      barre.ajouter = null;
    };
  });

  const duTableau = $derived(articles.filter((a) => a.boardId === choisi));
  const visibles = $derived(
    duTableau.filter((a) => (filtre === 'tout' ? true : filtre === 'racheter' ? a.toBuy : a.expiresSoon)),
  );
  const groupesDuTableau = $derived(groupes.filter((g) => g.boardId === choisi).sort((a, b) => a.position - b.position));
  /** Une section par groupe, puis « Sans groupe » ; sans aucun groupe, une seule section, sans titre. */
  const sections = $derived.by(() => {
    if (!groupesDuTableau.length) return [{ cle: 'tout', groupe: null as Groupe | null, articles: visibles }];
    const connus = new Set(groupesDuTableau.map((g) => g.id));
    return [
      ...groupesDuTableau.map((g) => ({ cle: g.id, groupe: g as Groupe | null, articles: visibles.filter((a) => a.groupId === g.id) })),
      { cle: 'sans', groupe: null, articles: visibles.filter((a) => !a.groupId || !connus.has(a.groupId)) },
    ].filter((x) => x.articles.length);
  });

  async function ajuster(a: Article, delta: number) {
    try {
      const nouveau = await api<Article>(`/stock/items/${a.id}/adjust`, { method: 'POST', body: JSON.stringify({ delta }) });
      articles = articles.map((x) => (x.id === a.id ? nouveau : x));
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }
</script>

{#snippet boutons()}
  {#if peutFaire && articles.length}<button onclick={() => (sortie = true)}>Déclarer une sortie</button>{/if}
{/snippet}

{#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

<div class="tableaux" role="tablist" aria-label="Tableaux">
  {#each tableaux as t (t.id)}
    <button
      role="tab"
      class="tableau-puce"
      class:actif={choisi === t.id}
      aria-selected={choisi === t.id}
      onclick={() => (choisi = t.id)}
      ondblclick={() => peutGerer && (ficheTableau = { tableau: t })}
      title={peutGerer ? 'Double-clic : modifier le tableau' : undefined}
    >
      <Vignette icon={t.icon} color={t.color} image={imageDuTableau(t)} taille={32} />
      {t.name}
    </button>
  {/each}
  {#if peutGerer}<button class="nouveau" onclick={() => (ficheTableau = { tableau: null })}>+ Nouveau tableau</button>{/if}
</div>

{#if !tableaux.length}
  <p class="muet">Aucun tableau pour l’instant. Créez-en un — le garde-manger, la salle de bain, la cave…</p>
{:else}
  <div class="outils">
    <div class="filtres">
      <button class:actif={filtre === 'tout'} onclick={() => (filtre = 'tout')}>Tout · {duTableau.length}</button>
      <button class:actif={filtre === 'racheter'} onclick={() => (filtre = 'racheter')}>À racheter · {duTableau.filter((a) => a.toBuy).length}</button>
      <button class:actif={filtre === 'perime'} onclick={() => (filtre = 'perime')}>Bientôt périmé · {duTableau.filter((a) => a.expiresSoon).length}</button>
    </div>
    {#if peutGerer && choisi}
      <button class="groupes" onclick={() => (gestionGroupes = true)}>Groupes du tableau</button>
      <button class="lien" onclick={() => (ficheTableau = { tableau: tableaux.find((t) => t.id === choisi) ?? null })}>Modifier le tableau</button>
    {/if}
  </div>

  <div class="table" role="table" aria-label="Articles">
    <div class="rang titres" role="row">
      <span class="c-nom">Article</span><span class="c-qte">Quantité</span><span class="c-per">Péremption</span><span class="c-act"></span>
    </div>
    {#each sections as section (section.cle)}
      {#if groupesDuTableau.length}
        <div class="titre-groupe" role="row">
          <i style:background={section.groupe?.color ?? '#c9d3d0'}></i>{section.groupe?.name ?? 'Sans groupe'}
          <span class="muet">{section.articles.length} article{section.articles.length > 1 ? 's' : ''}</span>
        </div>
      {/if}
      {#each section.articles as a (a.id)}
        {@const p = a.expiresOn ? peremptionEnClair(a.expiresOn, aujourdHui) : null}
        <div class="rang" role="row">
          <div class="c-nom">
            <button class="article" onclick={() => (fiche = { article: a })}>
              <Vignette icon={a.icon} color={a.color} image={imageDeLArticle(a)} />
              <span class="textes">
                <b>{a.name}</b>
                {#if a.detail}<span class="muet">{a.detail}</span>{/if}
              </span>
            </button>
            {#if a.link}<a class="racheter" href={a.link} target="_blank" rel="noopener noreferrer">Racheter ↗</a>{/if}
          </div>
          <span class="c-qte">
            <button class="pm" aria-label={`Une de moins : ${a.name}`} disabled={!peutFaire || a.quantity === 0} onclick={() => ajuster(a, -1)}>−</button>
            <b class="nombre" class:bas={a.toBuy}>{a.quantity}</b>
            <button class="pm" aria-label={`Une de plus : ${a.name}`} disabled={!peutFaire} onclick={() => ajuster(a, 1)}>+</button>
            {#if a.minimum !== null}<span class="muet petit">min {a.minimum}</span>{/if}
          </span>
          <span class="c-per" class:alerte={p?.alerte}>{p?.texte ?? '—'}</span>
          <span class="c-act">
            {#if peutFaire}
              <button
                class="retirer"
                disabled={a.quantity === 0}
                onclick={(e) => (retrait = { article: a, ancre: (e.currentTarget as HTMLElement).getBoundingClientRect() })}>Retirer</button
              >
            {/if}
          </span>
        </div>
      {/each}
    {:else}
      <p class="muet vide">{duTableau.length ? 'Rien dans ce filtre.' : 'Aucun article dans ce tableau.'}</p>
    {/each}
  </div>
  <p class="muet petit">
    Sous le minimum, la quantité passe en orange et l’article rejoint « À racheter ». « Retirer » note ce qui sort, et
    pourquoi ; l’historique est dans la fiche de l’article.
  </p>
{/if}

{#if fiche && choisi}
  <FicheArticle
    article={fiche.article}
    {tableaux}
    {groupes}
    tableauId={choisi}
    lectureSeule={!peutGerer}
    onFermer={() => (fiche = null)}
    onEnregistre={() => ((fiche = null), void charger())}
  />
{/if}

{#if ficheTableau}
  <FicheTableau
    tableau={ficheTableau.tableau}
    onFermer={() => (ficheTableau = null)}
    onEnregistre={(id) => {
      ficheTableau = null;
      if (id) choisi = id;
      void charger();
    }}
  />
{/if}

{#if retrait}
  <Retrait
    article={retrait.article}
    ancre={retrait.ancre}
    onFermer={() => (retrait = null)}
    onRetire={() => ((retrait = null), void charger())}
  />
{/if}

{#if gestionGroupes && choisi}
  {@const t = tableaux.find((x) => x.id === choisi)}
  {#if t}
    <GroupesDuTableau tableau={t} {groupes} {articles} onFermer={() => (gestionGroupes = false)} onChange={charger} />
  {/if}
{/if}

{#if sortie}
  <Sortie {tableaux} {articles} tableauId={choisi} onFermer={() => (sortie = false)} onValide={() => ((sortie = false), void charger())} />
{/if}

<style>
  .tableaux {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .tableau-puce {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 4px 18px 4px 4px;
    border-radius: 999px;
    font-weight: 600;
  }

  .tableau-puce.actif {
    border: 2px solid var(--accent);
    background: var(--accent-doux);
    color: var(--accent-sombre);
  }

  .nouveau {
    border-style: dashed;
    border-radius: 999px;
    color: var(--gris);
  }

  .outils {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
  }

  .filtres {
    flex: 1;
    display: flex;
    gap: 6px;
  }

  .filtres button {
    min-height: 36px;
    border-radius: 999px;
    padding: 0 14px;
  }

  .filtres button.actif {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .table {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .rang {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    border-top: 1px solid var(--trait);
  }

  .rang.titres {
    border-top: none;
    background: var(--surface-douce);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  .c-nom {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* Un bouton sans habillage, mais qui garde sa place dans la colonne. */
  button.article {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    color: inherit;
    font: inherit;
  }

  .textes {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .textes .muet {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .racheter {
    flex: none;
    color: var(--accent);
    font-weight: 600;
    font-size: 13px;
    text-decoration: none;
  }

  .titre-groupe {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-top: 1px solid var(--trait);
    background: var(--surface-douce);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--encre-douce);
  }

  .titre-groupe i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .titre-groupe .muet {
    margin-left: auto;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }

  .c-act {
    flex: 0 0 100px;
    display: flex;
    justify-content: flex-end;
  }

  .retirer {
    min-height: 34px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
  }

  .groupes {
    min-height: 36px;
    border-radius: 999px;
    padding: 0 14px;
    margin-right: 14px;
    font-size: 13px;
    font-weight: 600;
  }

  button.article:hover b {
    color: var(--accent);
  }

  .c-qte {
    flex: 0 0 220px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pm {
    width: 30px;
    min-height: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
  }

  .nombre {
    min-width: 28px;
    text-align: center;
    font-size: 17px;
  }

  .nombre.bas {
    color: #c2410c;
  }

  .c-per {
    flex: 0 0 180px;
  }

  .c-per.alerte {
    color: var(--alerte-encre);
    font-weight: 600;
    font-size: 13px;
  }


  .petit {
    font-size: 13px;
  }

  .vide {
    padding: 16px 18px;
  }

  button.lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }

  @media (max-width: 760px) {
    .rang.titres,
    .c-per,
    .racheter {
      display: none;
    }

    .c-act {
      flex: none;
    }

    .c-qte {
      flex: none;
    }
  }
</style>
