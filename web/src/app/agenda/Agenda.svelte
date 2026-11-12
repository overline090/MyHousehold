<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { barre } from '../../lib/barre.svelte';
  import { aLeDroit, api, session } from '../../lib/session.svelte';
  import { jourDans, type Membre } from '../accueil/donnees';
  import FicheLecture from '../taches/FicheLecture.svelte';
  import {
    debutDeSemaine,
    decaler,
    decalerMois,
    enteteDeColonnes,
    heureLocale,
    jourEnClair,
    moisEnClair,
    semainesDuMois,
    type Instance,
  } from './calendrier';
  import FicheRendezVous from './FicheRendezVous.svelte';

  /** Le mois en grand, et le jour choisi à droite ; la semaine, le jour, ou la liste. */
  interface EcheanceDuJour {
    id: string;
    taskId: string;
    title: string;
    scheduledFor: string | null;
    dueAt: string | null;
    status: string;
    assignee: { id: string; firstName: string } | null;
  }
  type Vue = 'mois' | 'semaine' | 'jour' | 'liste';

  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');
  const debut = $derived(session.foyer?.weekStartsOn ?? 1);
  const aujourdHui = $derived(jourDans(fuseau));
  const peutGerer = $derived(aLeDroit('MANAGE_APPOINTMENTS'));

  let vue = $state<Vue>('mois');
  let choisi = $state(jourDans(session.foyer?.timezone ?? 'Europe/Paris'));
  let rendezVous = $state<Instance[]>([]);
  let echeances = $state<EcheanceDuJour[]>([]);
  let membres = $state<Map<string, Membre>>(new Map());
  let erreur = $state<string | null>(null);
  let fiche = $state<{ id: string | null; jour: string } | null>(null);
  let tacheOuverte = $state<string | null>(null);

  const semaines = $derived(semainesDuMois(choisi, debut));
  const plage = $derived.by((): [string, string] => {
    switch (vue) {
      case 'mois':
        return [semaines[0][0], semaines[semaines.length - 1][6]];
      case 'semaine': {
        const d = debutDeSemaine(choisi, debut);
        return [d, decaler(d, 6)];
      }
      case 'jour':
        return [choisi, choisi];
      case 'liste':
        return [choisi, decaler(choisi, 41)];
    }
  });

  async function charger(du: string, au: string) {
    try {
      const [rdv, occ, gens] = await Promise.all([
        api<Instance[]>(
          `/appointments?from=${du}&to=${au}`,
        ),
        api<{ data: EcheanceDuJour[] }>(`/occurrences?from=${du}&to=${au}&limit=500`),
        api<Membre[]>('/members'),
      ]);
      rendezVous = rdv.sort((a, b) => a.startAt.localeCompare(b.startAt));
      echeances = occ.data.filter((o) => o.scheduledFor && o.status !== 'SKIPPED');
      membres = new Map(gens.map((m) => [m.id, m]));
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void barre.rafraichir;
    const [du, au] = plage;
    void charger(du, au);
  });

  $effect(() => {
    barre.ajouter = peutGerer ? { libelle: 'Nouveau rendez-vous', faire: () => (fiche = { id: null, jour: choisi }) } : null;
    return () => {
      barre.actions = null;
      barre.ajouter = null;
    };
  });

  /** Les jours couverts par un rendez-vous : un rendez-vous sur plusieurs jours paraît sur chacun. */
  function joursDe(r: Instance): string[] {
    const premier = jourDans(fuseau, new Date(r.startAt));
    // La fin est exclusive : un rendez-vous jusqu'à minuit ne déborde pas sur le lendemain.
    const dernier = jourDans(fuseau, new Date(new Date(r.endAt).getTime() - 1));
    const jours: string[] = [];
    for (let j = premier; j <= dernier && jours.length < 62; j = decaler(j, 1)) jours.push(j);
    return jours;
  }

  const parJour = $derived.by(() => {
    const carte = new Map<string, { rdv: Instance[]; taches: EcheanceDuJour[] }>();
    const case_ = (j: string) => {
      if (!carte.has(j)) carte.set(j, { rdv: [], taches: [] });
      return carte.get(j)!;
    };
    for (const r of rendezVous) for (const j of joursDe(r)) case_(j).rdv.push(r);
    for (const o of echeances) case_(o.scheduledFor!).taches.push(o);
    return carte;
  });

  function du(j: string) {
    return parJour.get(j) ?? { rdv: [], taches: [] };
  }

  /** Une couleur par personne invitée, pour lire le mois d'un coup d'œil. */
  function couleurDe(r: Instance): string {
    const premier = r.attendees[0]?.id;
    const m = premier ? membres.get(premier) : undefined;
    return m?.avatarColor ?? 'var(--accent)';
  }

  function precedent() {
    choisi = vue === 'mois' ? decalerMois(choisi, -1) : decaler(choisi, vue === 'semaine' ? -7 : vue === 'liste' ? -42 : -1);
  }

  function suivant() {
    choisi = vue === 'mois' ? decalerMois(choisi, 1) : decaler(choisi, vue === 'semaine' ? 7 : vue === 'liste' ? 42 : 1);
  }

  const titre = $derived(
    vue === 'mois'
      ? moisEnClair(choisi)
      : vue === 'semaine'
        ? `Semaine du ${jourEnClair(debutDeSemaine(choisi, debut))}`
        : vue === 'jour'
          ? jourEnClair(choisi).replace(/^./, (c) => c.toUpperCase())
          : `À partir du ${jourEnClair(choisi)}`,
  );

  function heureDe(r: Instance): string {
    return r.isAllDay ? 'Journée' : heureLocale(r.startAt, fuseau);
  }
</script>

{#snippet journee(j: string, avecAjout: boolean)}
  {@const contenu = du(j)}
  {@const elements = [
    ...contenu.rdv.map((r) => ({ cle: r.appointmentId + r.startAt, cleTri: r.isAllDay ? '00:00' : heureLocale(r.startAt, fuseau), r, o: null })),
    ...contenu.taches.map((o) => {
      const h = o.dueAt ? heureLocale(o.dueAt, fuseau) : null;
      // Une échéance « dans la journée » tombe à 23 h 59 : elle n'a pas d'heure.
      return { cle: o.id, cleTri: h && !h.endsWith(':59') ? h : '99', r: null, o };
    }),
  ].sort((x, y) => x.cleTri.localeCompare(y.cleTri))}
  <div class="journee">
    {#each elements as e (e.cle)}
      {#if e.r}
        {@const r = e.r}
        <button class="element" onclick={() => (fiche = { id: r.appointmentId, jour: j })}>
          <span class="heure">{heureDe(r)}</span>
          <span class="trait" style:background={couleurDe(r)}></span>
          <span class="quoi">
            <b>{r.title}</b>
            <span class="muet">
              {[r.location, r.attendees.map((a) => a.firstName).join(', ')].filter(Boolean).join(' — ')}
              {r.visibility === 'PRIVATE' ? ' · privé' : ''}{r.isRecurring ? ' · se répète' : ''}
            </span>
          </span>
        </button>
      {:else if e.o}
        {@const o = e.o}
        <button class="element tache" onclick={() => (tacheOuverte = o.taskId)}>
          <span class="heure">{e.cleTri === '99' ? 'Journée' : e.cleTri}</span>
          <span class="trait gris"></span>
          <span class="quoi">
            <b class:faite={o.status === 'DONE'}>{o.title}</b>
            <span class="muet">Tâche{o.assignee ? ` — ${o.assignee.firstName}` : ''}{o.status === 'DONE' ? ' · faite' : ''}</span>
          </span>
        </button>
      {/if}
    {:else}
      <p class="muet vide">Rien de prévu.</p>
    {/each}
    {#if avecAjout && peutGerer}
      <button class="ajouter-jour" onclick={() => (fiche = { id: null, jour: j })}>+ Rendez-vous ce jour-là</button>
    {/if}
  </div>
{/snippet}

{#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

<div class="outils">
  <button class="fleche" aria-label="Précédent" onclick={precedent}>‹</button>
  <h2>{titre}</h2>
  <button class="fleche" aria-label="Suivant" onclick={suivant}>›</button>
  <button onclick={() => (choisi = aujourdHui)}>Aujourd’hui</button>
  <span class="espace"></span>
  <div class="segment" role="group" aria-label="Vue">
    {#each [['mois', 'Mois'], ['semaine', 'Semaine'], ['jour', 'Jour'], ['liste', 'Liste']] as const as [v, libelle] (v)}
      <button class:actif={vue === v} onclick={() => (vue = v)}>{libelle}</button>
    {/each}
  </div>
</div>

{#if vue === 'mois'}
  <div class="mois-et-jour">
    <div class="mois" role="grid" aria-label={moisEnClair(choisi)}>
      <div class="entete" role="row">
        {#each enteteDeColonnes(debut) as nom (nom)}<span role="columnheader">{nom}</span>{/each}
      </div>
      {#each semaines as semaine (semaine[0])}
        <div class="semaine" role="row">
          {#each semaine as j (j)}
            {@const contenu = du(j)}
            {@const elements = [...contenu.rdv.map((r) => ({ cle: r.appointmentId + r.startAt, texte: r.title, couleur: couleurDe(r), tache: false })), ...contenu.taches.map((o) => ({ cle: o.id, texte: o.title, couleur: '', tache: true }))]}
            <button
              class="case"
              role="gridcell"
              class:autre={j.slice(0, 7) !== choisi.slice(0, 7)}
              class:choisi={j === choisi}
              aria-selected={j === choisi}
              aria-label={jourEnClair(j)}
              onclick={() => (choisi = j)}
              ondblclick={() => peutGerer && (fiche = { id: null, jour: j })}
            >
              <span class="numero" class:aujourdhui={j === aujourdHui}>{Number(j.slice(8))}</span>
              {#each elements.slice(0, 3) as e (e.cle)}
                <span class="puce" class:tache={e.tache} style:--couleur={e.couleur}>{e.texte}</span>
              {/each}
              {#if elements.length > 3}<span class="plus">+{elements.length - 3}</span>{/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    <aside class="jour-choisi">
      <h3>{jourEnClair(choisi)}</h3>
      {@render journee(choisi, true)}
    </aside>
  </div>
{:else if vue === 'semaine'}
  <div class="semaine-vue">
    {#each Array.from({ length: 7 }, (_, i) => decaler(debutDeSemaine(choisi, debut), i)) as j (j)}
      <section class="colonne" class:aujourdhui={j === aujourdHui}>
        <h3>{jourEnClair(j)}</h3>
        {@render journee(j, false)}
      </section>
    {/each}
  </div>
{:else if vue === 'jour'}
  <div class="jour-seul">{@render journee(choisi, true)}</div>
{:else}
  <div class="liste">
    {#each Array.from({ length: 42 }, (_, i) => decaler(choisi, i)).filter((j) => du(j).rdv.length || du(j).taches.length) as j (j)}
      <section>
        <h3 class:aujourdhui={j === aujourdHui}>{jourEnClair(j)}</h3>
        {@render journee(j, false)}
      </section>
    {:else}
      <p class="muet">Rien de prévu sur ces six semaines.</p>
    {/each}
  </div>
{/if}

{#if fiche}
  <FicheRendezVous
    id={fiche.id}
    jour={fiche.jour}
    membres={[...membres.values()]}
    lectureSeule={!peutGerer}
    onFermer={() => (fiche = null)}
    onEnregistre={() => {
      fiche = null;
      barre.rafraichir += 1;
    }}
  />
{/if}

{#if tacheOuverte}
  <FicheLecture tacheId={tacheOuverte} {membres} onFermer={() => (tacheOuverte = null)} />
{/if}

<style>
  .outils {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }

  .outils h2 {
    font-size: 20px;
    min-width: 180px;
    text-align: center;
  }

  .fleche {
    width: 36px;
    min-height: 36px;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 22px;
  }

  .espace {
    flex: 1;
  }

  .segment {
    display: flex;
    border: 1px solid var(--trait-net);
    border-radius: 10px;
    overflow: hidden;
  }

  .segment button {
    border: none;
    border-radius: 0;
    min-height: 38px;
    padding: 0 16px;
  }

  .segment button + button {
    border-left: 1px solid var(--trait-net);
  }

  .segment button.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  .mois-et-jour {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 20px;
    align-items: start;
  }

  .mois {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    overflow: hidden;
  }

  .entete,
  .semaine {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .entete span {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
    padding: 10px;
    border-bottom: 1px solid var(--trait);
  }

  .case {
    all: unset;
    box-sizing: border-box;
    min-height: 104px;
    padding: 6px;
    border-right: 1px solid var(--trait);
    border-bottom: 1px solid var(--trait);
    display: flex;
    flex-direction: column;
    gap: 3px;
    cursor: pointer;
    min-width: 0;
  }

  .case:nth-child(7) {
    border-right: none;
  }

  .case:hover {
    background: var(--surface-douce);
  }

  .case.choisi {
    background: var(--accent-doux);
  }

  .case:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .case.autre .numero {
    color: var(--gris);
    opacity: 0.6;
  }

  .numero {
    font-size: 13px;
    font-weight: 600;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .numero.aujourdhui {
    background: var(--accent);
    color: #fff;
  }

  .puce {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--couleur, var(--accent));
    background: color-mix(in srgb, var(--couleur, var(--accent)) 14%, transparent);
  }

  .puce.tache {
    color: var(--gris);
    background: var(--surface-douce);
    font-weight: 500;
  }

  .plus {
    font-size: 11px;
    color: var(--gris);
    padding-left: 4px;
  }

  .jour-choisi h3,
  .colonne h3,
  .liste h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
    margin-bottom: 8px;
  }

  .journee {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .element {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 14px;
    padding: 12px 14px;
  }

  .element:hover {
    border-color: var(--accent-trait);
  }

  .element:focus-visible {
    outline: 2px solid var(--accent);
  }

  .element .heure {
    flex: none;
    width: 58px;
    font-weight: 700;
  }

  .element .trait {
    flex: none;
    width: 3px;
    align-self: stretch;
    border-radius: 2px;
  }

  .element .trait.gris {
    background: var(--trait-net);
  }

  .quoi {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .quoi .muet {
    font-size: 13px;
  }

  .faite {
    text-decoration: line-through;
    color: var(--gris);
  }

  .vide {
    padding: 4px 2px;
  }

  .ajouter-jour {
    align-self: flex-start;
    border-radius: 999px;
  }

  .semaine-vue {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 10px;
  }

  .colonne.aujourdhui h3,
  .liste h3.aujourdhui {
    color: var(--accent);
  }

  .colonne .element {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
  }

  .colonne .element .trait {
    display: none;
  }

  .jour-seul,
  .liste {
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  @media (max-width: 1100px) {
    .mois-et-jour {
      grid-template-columns: 1fr;
    }

    .semaine-vue {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .case {
      min-height: 56px;
    }

    .puce {
      font-size: 0;
      height: 6px;
      padding: 0;
    }

    .outils h2 {
      min-width: 0;
      font-size: 17px;
    }
  }
</style>
