<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { barre } from '../../lib/barre.svelte';
  import Icone from '../../lib/Icone.svelte';
  import { enregistrerPreferences, preferences, type Taille, type Tuile } from '../../lib/preferences.svelte';
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
    { id: 'en-retard', taille: 'L' },
    { id: 'aujourd-hui', taille: 'S' },
    { id: 'mes-taches', taille: 'M' },
    { id: 'rendez-vous', taille: 'M' },
    { id: 'a-surveiller', taille: 'M' },
    { id: 'autres', taille: 'M' },
  ];
  const TAILLES: Taille[] = ['S', 'M', 'L', 'XL'];

  let donnees = $state<Accueil | null>(null);
  let erreur = $state<string | null>(null);
  let edition = $state(false);
  let brouillon = $state<Tuile[]>([]);
  let catalogue = $state(false);
  let glissee = $state<number | null>(null);

  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');
  const disposition = $derived(
    edition
      ? brouillon
      : (preferences.valeurs.accueil ?? PAR_DEFAUT).filter((t) => t.id in TUILES),
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
    brouillon = disposition.map((t) => ({ ...t }));
    edition = true;
  }

  async function terminer() {
    const tuiles = brouillon.map((t) => ({ ...t }));
    edition = false;
    catalogue = false;
    await enregistrerPreferences({ accueil: tuiles }).catch(() => {});
  }

  function retablir() {
    brouillon = PAR_DEFAUT.map((t) => ({ ...t }));
  }

  function deplacer(depuis: number, vers: number) {
    if (depuis === vers) return;
    const copie = [...brouillon];
    const [tuile] = copie.splice(depuis, 1);
    copie.splice(vers, 0, tuile);
    brouillon = copie;
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
    Glissez les tuiles pour les déplacer, choisissez leur taille (S, M, L, XL), retirez celles qui ne
    vous servent pas. Votre accueil n’appartient qu’à vous : chacun a le sien.
  </div>
{/if}

<div class="tuiles" class:edition>
  {#each disposition as tuile, i (tuile.id)}
    {#if edition || contenu(tuile.id) > 0 || !donnees}
      <section
        class="tuile t{tuile.taille}"
        role="group"
        aria-label={TUILES[tuile.id]}
        class:glissee={glissee === i}
        draggable={edition}
        ondragstart={() => (glissee = i)}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => {
          e.preventDefault();
          if (glissee !== null) deplacer(glissee, i);
          glissee = null;
        }}
        ondragend={() => (glissee = null)}
      >
        <div class="tete">
          {#if edition}<span class="poignee" title="Glisser pour déplacer"><Icone nom="poignee" taille={18} /></span>{/if}
          <h2>{TUILES[tuile.id]}</h2>
          {#if edition}
            <div class="tailles" role="group" aria-label="Taille">
              {#each TAILLES as t (t)}
                <button class:actif={tuile.taille === t} onclick={() => (tuile.taille = t)}>{t}</button>
              {/each}
            </div>
            <button
              class="retirer"
              aria-label={`Retirer ${TUILES[tuile.id]}`}
              onclick={() => (brouillon = brouillon.filter((x) => x.id !== tuile.id))}
            ><Icone nom="fermer" taille={14} /></button>
          {:else if tuile.id !== 'aujourd-hui' && donnees}
            <span class="compte">{contenu(tuile.id)}</span>
          {/if}
        </div>
        {@render corps(tuile.id)}
      </section>
    {/if}
  {/each}

  {#if edition}
    <div class="ajout-tuile">
      {#if catalogue}
        {#each Object.keys(TUILES).filter((id) => !brouillon.some((t) => t.id === id)) as id (id)}
          <button onclick={() => (brouillon = [...brouillon, { id, taille: 'M' }])}>+ {TUILES[id]}</button>
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
  }

  .tS {
    grid-column: span 4;
  }
  .tM {
    grid-column: span 6;
  }
  .tL {
    grid-column: span 8;
  }
  .tXL {
    grid-column: span 12;
  }

  /* Sur téléphone, les tuiles s'empilent dans l'ordre choisi. */
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

  .tailles {
    display: flex;
    border: 1px solid var(--trait-net);
    border-radius: 8px;
    overflow: hidden;
  }

  .tailles button,
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

  .tailles button + button {
    border-left: 1px solid var(--trait-net);
  }

  .tailles button.actif {
    background: var(--accent);
    color: #fff;
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
