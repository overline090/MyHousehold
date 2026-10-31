<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { barre } from '../../lib/barre.svelte';
  import Icone from '../../lib/Icone.svelte';
  import { enregistrerPreferences, preferences, type Taille, type Tuile } from '../../lib/preferences.svelte';
  import { aimanter, colonnesPour, uniteEnClair } from './tuiles';
  import { aller } from '../../lib/route.svelte';
  import { aLeDroit, api, session } from '../../lib/session.svelte';
  import Photo from '../Photo.svelte';
  import {
    chargerAccueil,
    heureEnClair,
    jourDans,
    jourEnClair,
    joursEnClair,
    priorite,
    retardEnClair,
    type Accueil,
    type Occurrence,
    type TacheDeFond,
  } from './donnees';

  /** Les tuiles que l'accueil sait afficher, et la disposition de départ. */
  const TUILES: Record<string, string> = {
    'en-retard': 'En retard',
    'aujourd-hui': 'Aujourd’hui',
    'mes-taches': 'Mes tâches du jour',
    'rendez-vous': 'Rendez-vous de la semaine',
    'a-surveiller': 'À surveiller',
    autres: 'À faire par les autres',
  };
  const PAR_DEFAUT: Tuile[] = [
    { id: 'en-retard', colonnes: 8 },
    { id: 'aujourd-hui', colonnes: 4 },
    { id: 'mes-taches', colonnes: 6 },
    { id: 'rendez-vous', colonnes: 6 },
    { id: 'a-surveiller', colonnes: 6 },
    { id: 'autres', colonnes: 6 },
  ];
  /** Les dispositions enregistrées avant le redimensionnement à la main. */
  const LARGEURS: Record<Taille, number> = { S: 4, M: 6, L: 8, XL: 12 };

  function normaliser(t: Tuile): Tuile {
    const colonnes = Math.min(12, Math.max(1, t.colonnes ?? LARGEURS[t.taille ?? 'M'] ?? 6));
    return t.hauteur ? { id: t.id, colonnes, hauteur: t.hauteur } : { id: t.id, colonnes };
  }

  let donnees = $state<Accueil | null>(null);
  let erreur = $state<string | null>(null);
  let edition = $state(false);
  let brouillon = $state<Tuile[]>([]);
  let catalogue = $state(false);
  let glissee = $state<number | null>(null);
  /** Où la tuile glissée serait lâchée : sur une autre (échange), ou à côté (insertion). */
  let survol = $state<{ index: number; mode: 'echanger' | 'avant' | 'apres' } | null>(null);
  let depuisPoignee = false;
  let grille = $state<HTMLElement>();
  /** Le redimensionnement en cours : ce que la tuile mesure, et sur quoi elle s'est aimantée. */
  let redim = $state<{ index: number; aligneSur: string | null; repere: number | null } | null>(null);

  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');
  const disposition = $derived(
    edition
      ? brouillon
      : (preferences.valeurs.accueil ?? PAR_DEFAUT).filter((t) => t.id in TUILES).map(normaliser),
  );
  const peutCocher = $derived(aLeDroit('COMPLETE_TASKS'));

  async function charger() {
    if (!session.utilisateur) return;
    try {
      donnees = await chargerAccueil(fuseau, session.utilisateur.id);
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void barre.rafraichir;
    void charger();
  });

  // Les boutons de l'accueil vont dans la barre d'outils, à gauche d'« Ajouter ».
  $effect(() => {
    barre.actions = edition ? boutonsEdition : boutonPersonnaliser;
    return () => {
      barre.actions = null;
    };
  });

  function personnaliser() {
    brouillon = disposition.map(normaliser);
    edition = true;
  }

  async function terminer() {
    const tuiles = brouillon.map(normaliser);
    edition = false;
    catalogue = false;
    await enregistrerPreferences({ accueil: tuiles }).catch(() => {});
  }

  function retablir() {
    brouillon = PAR_DEFAUT.map((t) => ({ ...t }));
  }

  /** Lâchée sur une autre tuile : elles échangent leur place, chacune garde sa taille. */
  function lacher(depuis: number, cible: number, mode: 'echanger' | 'avant' | 'apres') {
    if (depuis === cible) return;
    const copie = [...brouillon];
    if (mode === 'echanger') {
      [copie[depuis], copie[cible]] = [copie[cible], copie[depuis]];
    } else {
      const [tuile] = copie.splice(depuis, 1);
      let vers = cible > depuis ? cible - 1 : cible;
      if (mode === 'apres') vers += 1;
      copie.splice(vers, 0, tuile);
    }
    brouillon = copie;
  }

  /** Au milieu d'une tuile : échanger ; sur son bord gauche ou droit : s'insérer à côté. */
  function modeDeLacher(e: DragEvent): 'echanger' | 'avant' | 'apres' {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    return x < 0.2 ? 'avant' : x > 0.8 ? 'apres' : 'echanger';
  }

  function survoler(e: DragEvent, index: number) {
    e.preventDefault();
    survol = glissee === null || glissee === index ? null : { index, mode: modeDeLacher(e) };
  }

  /**
   * Tirer le coin, le bord droit ou le bord bas : la largeur se cale sur
   * les colonnes, la hauteur s'aimante sur le bas d'une tuile voisine,
   * sinon sur une longueur entière.
   */
  function redimensionner(e: PointerEvent, index: number, sens: 'coin' | 'droite' | 'bas') {
    if (e.button !== 0 || !grille) return;
    e.preventDefault();
    e.stopPropagation();
    const poignee = e.currentTarget as HTMLElement;
    const section = poignee.closest('section') as HTMLElement;
    const depart = { x: e.clientX, y: e.clientY, l: section.offsetWidth, h: section.offsetHeight };
    const tuile = brouillon[index];
    poignee.setPointerCapture(e.pointerId);
    redim = { index, aligneSur: null, repere: null };

    const bouger = (ev: PointerEvent) => {
      if (!grille) return;
      if (sens !== 'bas') {
        tuile.colonnes = colonnesPour(depart.l + ev.clientX - depart.x, grille.clientWidth);
      }
      if (sens !== 'droite') {
        // Mesuré à chaque mouvement : changer la largeur peut faire passer
        // la tuile à la ligne, et les voisines avec elle.
        const haut = section.getBoundingClientRect().top;
        const voisines = [...grille.querySelectorAll<HTMLElement>('section.tuile')]
          .filter((v) => v !== section)
          .map((v) => {
            const r = v.getBoundingClientRect();
            return { nom: v.getAttribute('aria-label') ?? '', haut: r.top - haut, bas: r.bottom - haut };
          });
        const resultat = aimanter(depart.h + ev.clientY - depart.y, voisines);
        tuile.hauteur = resultat.hauteur;
        redim = {
          index,
          aligneSur: resultat.aligneSur,
          repere: resultat.aligneSur ? haut - grille.getBoundingClientRect().top + resultat.hauteur : null,
        };
      }
    };
    const finir = () => {
      poignee.removeEventListener('pointermove', bouger);
      poignee.removeEventListener('pointerup', finir);
      poignee.removeEventListener('pointercancel', finir);
      redim = null;
    };
    poignee.addEventListener('pointermove', bouger);
    poignee.addEventListener('pointerup', finir);
    poignee.addEventListener('pointercancel', finir);
  }

  async function cocher(o: Occurrence) {
    const fait = o.status === 'DONE';
    o.status = fait ? 'PENDING' : 'DONE';
    try {
      await api(`/occurrences/${o.id}/${fait ? 'uncomplete' : 'complete'}`, { method: 'POST', body: '{}' });
    } catch {
      o.status = fait ? 'DONE' : 'PENDING';
    }
    void charger();
  }

  async function faireDeFond(t: TacheDeFond) {
    await api(`/tasks/${t.id}/done`, { method: 'POST', body: '{}' }).catch(() => {});
    void charger();
  }

  function contenu(id: string): number {
    if (!donnees) return 0;
    switch (id) {
      case 'en-retard':
        return donnees.enRetard.length + donnees.fondEnRetard.length;
      case 'mes-taches':
        return donnees.mesTaches.length;
      case 'rendez-vous':
        return donnees.rendezVous.length;
      case 'a-surveiller':
        return donnees.aSurveiller.length;
      case 'autres':
        return donnees.autres.length;
      default:
        return 1;
    }
  }

  const rendezVousDuJour = $derived(
    donnees ? donnees.rendezVous.filter((r) => jourDans(fuseau, new Date(r.startAt)) === donnees!.aujourdHui).length : 0,
  );
</script>

{#snippet boutonPersonnaliser()}
  <button onclick={personnaliser}><Icone nom="crayon" taille={16} />Personnaliser</button>
{/snippet}

{#snippet boutonsEdition()}
  <button onclick={retablir}>Rétablir</button>
  <button class="primaire" onclick={terminer}>Terminé</button>
{/snippet}

{#snippet ligneOccurrence(o: Occurrence, enRetard: boolean)}
  {@const p = priorite(o.priority)}
  {@const heure = o.dueAt ? heureEnClair(o.dueAt, fuseau) : null}
  <div class="carte-tache" class:retard={enRetard} class:fait={o.status === 'DONE'}>
    <button
      class="case"
      class:cochee={o.status === 'DONE'}
      disabled={!peutCocher}
      aria-label={o.status === 'DONE' ? `Décocher ${o.title}` : `Cocher ${o.title}`}
      onclick={() => cocher(o)}
    >
      {#if o.status === 'DONE'}<Icone nom="coche" taille={15} />{/if}
    </button>
    <div class="texte">
      <h3>{o.title}</h3>
      <p class="muet" class:alerte={enRetard}>
        {#if o.group}<span class="groupe"><i style:background={o.group.color}></i>{o.group.name}</span> ·{/if}
        {#if enRetard && o.scheduledFor}
          {retardEnClair(o.scheduledFor, donnees!.aujourdHui)}
        {:else if o.status === 'DONE' && o.completedAt}
          Fait à {heureEnClair(o.completedAt, fuseau)}
        {:else}
          {heure ?? 'Dans la journée'}
        {/if}
      </p>
    </div>
    {#if p}<span class="etiquette {p.classe}">{p.libelle}</span>{/if}
  </div>
{/snippet}

{#snippet ligneDeFond(t: TacheDeFond, enRetard: boolean)}
  {@const delai = t.maxIntervalSeconds ?? 0}
  {@const ecoule = t.elapsedSeconds ?? 0}
  <div class="carte-tache" class:retard={enRetard} class:fond={enRetard}>
    {#if enRetard}
      <button class="case" disabled={!peutCocher} aria-label={`C’est fait : ${t.title}`} onclick={() => faireDeFond(t)}></button>
    {/if}
    <div class="texte">
      <h3>{t.title}</h3>
      <p class="muet" class:alerte={enRetard}>
        {t.lastDoneAt ? `Il y a ${joursEnClair(ecoule)}` : 'Jamais faite'}
        {#if delai} — à refaire dans les {joursEnClair(delai)}{/if}
      </p>
      {#if !enRetard && delai}
        <div class="jauge"><span style:width="{Math.min(100, (ecoule / delai) * 100)}%"></span></div>
      {/if}
    </div>
    {#if enRetard}
      <span class="etiquette fond">De fond</span>
    {:else}
      <button class="lien" disabled={!peutCocher} onclick={() => faireDeFond(t)}>C’est fait</button>
    {/if}
  </div>
{/snippet}

{#snippet corps(id: string)}
  {#if !donnees}
    <p class="muet">Chargement…</p>
  {:else if id === 'en-retard'}
    {#each donnees.fondEnRetard as t (t.id)}{@render ligneDeFond(t, true)}{/each}
    {#each donnees.enRetard as o (o.id)}{@render ligneOccurrence(o, true)}{/each}
    {#if contenu(id) === 0}<p class="muet">Rien en retard.</p>{/if}
  {:else if id === 'aujourd-hui'}
    {@const faites = donnees.mesTaches.filter((o) => o.status === 'DONE').length}
    <div class="chiffres">
      <div><b>{donnees.mesTaches.length}</b><span class="muet">{donnees.mesTaches.length > 1 ? 'tâches' : 'tâche'} pour moi</span></div>
      <div><b class="vert">{faites}</b><span class="muet">déjà {faites > 1 ? 'faites' : 'faite'}</span></div>
      <div><b>{rendezVousDuJour}</b><span class="muet">rendez-vous</span></div>
    </div>
  {:else if id === 'mes-taches'}
    {#each donnees.mesTaches as o (o.id)}{@render ligneOccurrence(o, false)}{/each}
    {#if contenu(id) === 0}<p class="muet">Rien pour vous aujourd’hui.</p>{/if}
  {:else if id === 'rendez-vous'}
    {#each donnees.rendezVous as r, i (r.appointmentId + r.startAt)}
      {@const jour = jourEnClair(r.startAt, fuseau, donnees.aujourdHui)}
      {#if i === 0 || jour !== jourEnClair(donnees.rendezVous[i - 1].startAt, fuseau, donnees.aujourdHui)}
        <div class="jour-rdv">{jour}</div>
      {/if}
      <div class="rdv">
        <span class="heure">{r.isAllDay ? 'Journée' : heureEnClair(r.startAt, fuseau)?.replace(' h ', ':')}</span>
        <span class="trait"></span>
        <div><h3>{r.title}</h3>{#if r.location}<p class="muet">{r.location}</p>{/if}</div>
      </div>
    {/each}
    {#if contenu(id) === 0}<p class="muet">Aucun rendez-vous cette semaine.</p>{/if}
    <button class="lien voir" onclick={() => aller('/agenda')}>Voir tout l’agenda ›</button>
  {:else if id === 'a-surveiller'}
    {#each donnees.aSurveiller as t (t.id)}{@render ligneDeFond(t, false)}{/each}
    {#if contenu(id) === 0}<p class="muet">Rien à surveiller.</p>{/if}
  {:else if id === 'autres'}
    {#each donnees.autres as o (o.id)}
      {@const qui = o.assignee ? donnees.membres.get(o.assignee.id) : undefined}
      <div class="carte-tache">
        {#if qui}<Photo membre={qui} taille={28} />{/if}
        <div class="texte">
          <h3>{o.title}</h3>
          <p class="muet">{o.assignee?.firstName} · {o.dueAt ? (heureEnClair(o.dueAt, fuseau) ?? 'Aujourd’hui') : 'Aujourd’hui'}</p>
        </div>
      </div>
    {/each}
    {#if contenu(id) === 0}<p class="muet">Personne d’autre n’a de tâche aujourd’hui.</p>{/if}
  {/if}
{/snippet}

{#if erreur}
  <div class="encadre alerte">{erreur}</div>
{/if}

{#if edition}
  <div class="encadre accent bandeau">
    Tirez le coin ou un bord d’une tuile pour la redimensionner : la taille s’aimante sur des longueurs
    entières et sur le bord des tuiles voisines. Glissez une tuile par sa poignée sur une autre pour les
    échanger, ou sur son bord pour l’insérer à côté. Double-cliquez le coin pour revenir à la hauteur
    automatique. Votre accueil n’appartient qu’à vous : chacun a le sien.
  </div>
{/if}

<div class="tuiles" class:edition class:redim={redim !== null} bind:this={grille}>
  {#if redim}
    <div class="guides" aria-hidden="true">{#each Array(12) as _, i (i)}<i></i>{/each}</div>
    {#if redim.repere !== null}
      <div class="repere" style:top="{redim.repere}px"><span>Aligné sur « {redim.aligneSur} »</span></div>
    {/if}
  {/if}
  {#each disposition as tuile, i (tuile.id)}
    {#if edition || contenu(tuile.id) > 0 || !donnees}
      <section
        class="tuile"
        class:fixe={!!tuile.hauteur}
        style:grid-column="span {tuile.colonnes}"
        style:height={tuile.hauteur ? `${tuile.hauteur}px` : null}
        role="group"
        aria-label={TUILES[tuile.id]}
        class:glissee={glissee === i}
        class:cible={survol?.index === i && survol.mode === 'echanger'}
        class:avant={survol?.index === i && survol.mode === 'avant'}
        class:apres={survol?.index === i && survol.mode === 'apres'}
        class:saisie={redim?.index === i}
        draggable={edition}
        ondragstart={(e) => {
          // Seule la poignée déplace la tuile : les bords la redimensionnent.
          if (!depuisPoignee) {
            e.preventDefault();
            return;
          }
          glissee = i;
          e.dataTransfer?.setData('text/plain', tuile.id);
        }}
        ondragover={(e) => survoler(e, i)}
        ondragleave={(e) => {
          // Passer sur un élément de la tuile n'est pas la quitter.
          const vers = e.relatedTarget as Node | null;
          if (survol?.index === i && !(vers && (e.currentTarget as HTMLElement).contains(vers))) survol = null;
        }}
        ondrop={(e) => {
          e.preventDefault();
          if (glissee !== null) lacher(glissee, i, modeDeLacher(e));
          glissee = null;
          survol = null;
        }}
        ondragend={() => {
          glissee = null;
          survol = null;
          depuisPoignee = false;
        }}
      >
        <div class="tete">
          {#if edition}
            <span
              class="poignee"
              title="Glisser pour déplacer"
              role="presentation"
              onpointerdown={() => (depuisPoignee = true)}
              onpointerup={() => (depuisPoignee = false)}
            ><Icone nom="poignee" taille={18} /></span>
          {/if}
          <h2>{TUILES[tuile.id]}</h2>
          {#if edition}
            <span class="mesure-texte" title="Largeur en colonnes × hauteur">
              {tuile.colonnes} × {tuile.hauteur ? uniteEnClair(tuile.hauteur) : 'auto'}
            </span>
            <button
              class="retirer"
              aria-label={`Retirer ${TUILES[tuile.id]}`}
              onclick={() => (brouillon = brouillon.filter((x) => x.id !== tuile.id))}
            ><Icone nom="fermer" taille={14} /></button>
          {:else if tuile.id !== 'aujourd-hui' && donnees}
            <span class="compte">{contenu(tuile.id)}</span>
          {/if}
        </div>
        <div class="corps">
          {@render corps(tuile.id)}
        </div>
        {#if edition}
          <span
            class="bord-d"
            role="presentation"
            title="Tirer pour changer la largeur"
            onpointerdown={(e) => redimensionner(e, i, 'droite')}
          ></span>
          <span
            class="bord-b"
            role="presentation"
            title="Tirer pour changer la hauteur"
            onpointerdown={(e) => redimensionner(e, i, 'bas')}
          ></span>
          <span
            class="coin"
            role="presentation"
            title="Tirer pour redimensionner — double-clic : hauteur automatique"
            onpointerdown={(e) => redimensionner(e, i, 'coin')}
            ondblclick={() => (tuile.hauteur = undefined)}
          ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 10 10 20M20 15l-5 5M20 4 4 20" /></svg></span>
          {#if redim?.index === i}
            <span class="mesure">
              {tuile.colonnes} {(tuile.colonnes ?? 1) > 1 ? 'colonnes' : 'colonne'} × {tuile.hauteur ? uniteEnClair(tuile.hauteur) : 'auto'}
              {#if redim.aligneSur} — alignée{/if}
            </span>
          {/if}
          {#if survol?.index === i && survol.mode === 'echanger' && glissee !== null}
            <span class="echange">⇄ Échanger avec « {TUILES[disposition[glissee].id]} »</span>
          {/if}
        {/if}
      </section>
    {/if}
  {/each}

  {#if edition}
    <div class="ajout-tuile">
      {#if catalogue}
        {#each Object.keys(TUILES).filter((id) => !brouillon.some((t) => t.id === id)) as id (id)}
          <button onclick={() => (brouillon = [...brouillon, { id, colonnes: 6 }])}>+ {TUILES[id]}</button>
        {:else}
          <p class="muet">Toutes les tuiles sont déjà sur votre accueil.</p>
        {/each}
      {:else}
        <button class="grand" onclick={() => (catalogue = true)}><span>+</span>Ajouter une tuile</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bandeau {
    margin-bottom: 14px;
    font-size: 13px;
  }

  .tuiles {
    position: relative;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 16px;
    align-items: start;
  }

  .tuile {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    position: relative;
  }

  .corps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }

  /* Une hauteur choisie à la main : ce qui dépasse défile dans la tuile. */
  .fixe .corps {
    flex: 1;
    overflow: auto;
  }

  /* Sur téléphone, les tuiles s'empilent dans l'ordre choisi, avec la hauteur choisie. */
  @media (max-width: 760px) {
    .tuile,
    .ajout-tuile {
      grid-column: span 12 !important;
    }
  }

  .edition .tuile {
    border: 2px dashed var(--accent-trait);
  }

  .glissee {
    opacity: 0.5;
  }

  .tete {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    flex: 1;
    font-size: 12px;
    font-weight: 700;
    color: var(--gris);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
  }

  .compte {
    font-size: 12px;
    font-weight: 700;
    color: var(--gris);
  }

  .poignee {
    color: var(--gris);
    cursor: grab;
    display: flex;
  }

  .mesure-texte {
    font-size: 11px;
    font-weight: 700;
    color: var(--gris);
    border: 1px solid var(--trait-net);
    border-radius: 8px;
    padding: 3px 7px;
    white-space: nowrap;
  }

  .retirer {
    min-height: 0;
    border: none;
    border-radius: 0;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 700;
    color: var(--gris);
    background: transparent;
  }

  .coin {
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gris);
    cursor: nwse-resize;
    touch-action: none;
  }

  .bord-d,
  .bord-b {
    position: absolute;
    touch-action: none;
  }

  .bord-d {
    top: 18px;
    bottom: 26px;
    right: -4px;
    width: 10px;
    cursor: ew-resize;
  }

  .bord-b {
    left: 18px;
    right: 26px;
    bottom: -4px;
    height: 10px;
    cursor: ns-resize;
  }

  .bord-d::after,
  .bord-b::after {
    content: '';
    position: absolute;
    border-radius: 4px;
    background: var(--trait-net);
  }

  .bord-d::after {
    top: 50%;
    left: 3px;
    width: 4px;
    height: 36px;
    margin-top: -18px;
  }

  .bord-b::after {
    left: 50%;
    top: 3px;
    height: 4px;
    width: 36px;
    margin-left: -18px;
  }

  .edition .tuile.saisie,
  .edition .tuile.cible {
    border: 2px solid var(--accent);
  }

  .tuile.saisie {
    box-shadow: 0 8px 28px rgba(15, 118, 110, 0.18);
    z-index: 2;
  }

  .tuile.saisie .coin {
    color: var(--accent);
  }

  .tuile.cible {
    background: var(--accent-doux);
  }

  .tuile.avant {
    box-shadow: -8px 0 0 -2px var(--accent);
  }

  .tuile.apres {
    box-shadow: 8px 0 0 -2px var(--accent);
  }

  .mesure,
  .echange {
    position: absolute;
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 3;
  }

  .mesure {
    right: 28px;
    bottom: 8px;
  }

  .echange {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 13px;
    padding: 7px 14px;
  }

  .guides {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 16px;
    pointer-events: none;
  }

  .guides i {
    background: rgba(15, 118, 110, 0.05);
    border-left: 1px dashed rgba(15, 118, 110, 0.25);
    border-right: 1px dashed rgba(15, 118, 110, 0.25);
  }

  .repere {
    position: absolute;
    left: -6px;
    right: -6px;
    height: 0;
    border-top: 2px dashed var(--accent);
    pointer-events: none;
    z-index: 3;
  }

  .repere span {
    position: absolute;
    right: 8px;
    top: -26px;
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 9px;
    border-radius: 999px;
  }

  .redim {
    user-select: none;
  }

  .retirer {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--trait-net);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .carte-tache {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--trait);
    border-radius: 12px;
    padding: 10px 12px;
  }

  .carte-tache.retard {
    border-color: var(--alerte-trait);
  }

  .carte-tache.fond {
    background: var(--alerte-fond);
  }

  .carte-tache.fait h3 {
    text-decoration: line-through;
    color: var(--gris);
  }

  .texte {
    flex: 1;
    min-width: 0;
  }

  .alerte {
    color: var(--alerte-encre);
  }

  .case {
    flex: none;
    width: 24px;
    height: 24px;
    min-height: 0;
    padding: 0;
    border-radius: 7px;
    border: 2px solid var(--trait-net);
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }

  .case.cochee {
    background: var(--accent);
    border-color: var(--accent);
  }

  .groupe {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
  }

  .groupe i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: block;
  }

  .etiquette {
    flex: none;
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 9px;
    white-space: nowrap;
  }

  .etiquette.urgente {
    color: #fff;
    background: #b91c1c;
  }

  .etiquette.haute {
    color: #991b1b;
    background: #fee2e2;
  }

  .etiquette.basse {
    color: var(--gris);
    background: var(--surface-douce);
    border: 1px solid var(--trait);
  }

  .etiquette.fond {
    color: var(--alerte-encre);
  }

  .jauge {
    height: 6px;
    border-radius: 999px;
    background: var(--trait);
    overflow: hidden;
    margin-top: 8px;
  }

  .jauge span {
    display: block;
    height: 100%;
    background: var(--alerte);
  }

  button.lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
  }

  button.voir {
    align-self: flex-start;
    color: var(--gris);
    font-weight: 500;
    padding-top: 8px;
  }

  .chiffres {
    display: flex;
    gap: 24px;
    padding: 4px 2px;
  }

  .chiffres div {
    display: flex;
    flex-direction: column;
  }

  .chiffres b {
    font-size: 30px;
    line-height: 1.1;
  }

  .vert {
    color: #15803d;
  }

  .jour-rdv {
    font-size: 11px;
    font-weight: 700;
    color: var(--gris);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-top: 6px;
  }

  .rdv {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }

  .rdv .heure {
    flex: none;
    width: 64px;
    font-weight: 700;
  }

  .rdv .trait {
    flex: none;
    width: 3px;
    align-self: stretch;
    border-radius: 2px;
    background: var(--accent);
  }

  .ajout-tuile {
    grid-column: span 4;
    border: 2px dashed var(--trait-net);
    border-radius: 16px;
    min-height: 120px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
    justify-content: center;
  }

  .ajout-tuile button {
    min-height: 36px;
    font-size: 13px;
  }

  .ajout-tuile button.grand {
    border: none;
    background: transparent;
    color: var(--gris);
    font-weight: 600;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ajout-tuile button.grand span {
    font-size: 26px;
    line-height: 1;
  }
</style>
