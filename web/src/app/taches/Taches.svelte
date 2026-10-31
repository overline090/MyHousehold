<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { barre, signalerUnChangement } from '../../lib/barre.svelte';
  import Icone from '../../lib/Icone.svelte';
  import { aLeDroit, api, session } from '../../lib/session.svelte';
  import { jourDans, joursEnClair, priorite } from '../accueil/donnees';
  import Photo from '../Photo.svelte';
  import { chargerTaches, type PageTaches, type Sorte, type Tache } from './donnees';
  import FicheTache from './FicheTache.svelte';
  import NouveauGroupe from './NouveauGroupe.svelte';
  import { decaler, ecartEnJours, prochaineFoisEnClair, prochainesFois, repetitionEnClair } from './regles';

  /** Toutes les tâches du foyer, rangées par groupe, avec leur règle en clair. */
  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');
  const aujourdHui = $derived(jourDans(fuseau));
  const peutGerer = $derived(aLeDroit('MANAGE_TASKS'));
  const peutCocher = $derived(aLeDroit('COMPLETE_TASKS'));

  let donnees = $state<PageTaches | null>(null);
  let erreur = $state<string | null>(null);
  let filtre = $state<Sorte | 'TOUT'>('TOUT');
  let recherche = $state('');
  let groupeChoisi = $state<string>('');
  /** La fiche ouverte : une tâche existante, ou `null` pour en créer une. */
  let fiche = $state<{ tache: Tache | null } | null>(null);
  let nouveauGroupe = $state(false);

  async function charger() {
    try {
      donnees = await chargerTaches(aujourdHui, decaler);
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
    barre.actions = peutGerer ? boutons : null;
    barre.ajouter = peutGerer ? () => (fiche = { tache: null }) : null;
    return () => {
      barre.actions = null;
      barre.ajouter = null;
    };
  });

  const FILTRES: [Sorte | 'TOUT', string][] = [
    ['TOUT', 'Tout'],
    ['SCHEDULED', 'Récurrentes'],
    ['BACKGROUND', 'De fond'],
    ['ONE_OFF', 'Ponctuelles'],
  ];

  const visibles = $derived.by(() => {
    if (!donnees) return [];
    const mot = recherche.trim().toLocaleLowerCase('fr');
    return donnees.taches.filter(
      (t) =>
        (filtre === 'TOUT' || t.kind === filtre) &&
        (!groupeChoisi || (t.group?.id ?? 'aucun') === groupeChoisi) &&
        (!mot || t.title.toLocaleLowerCase('fr').includes(mot)),
    );
  });

  /** Par groupe, dans l'ordre des groupes du foyer ; les tâches sans groupe à la fin. */
  const parGroupe = $derived.by(() => {
    if (!donnees) return [];
    const sections = donnees.groupes
      .map((g) => ({ cle: g.id, nom: g.name, couleur: g.color, taches: visibles.filter((t) => t.group?.id === g.id) }))
      .filter((s) => s.taches.length > 0);
    const sans = visibles.filter((t) => !t.group);
    if (sans.length) sections.push({ cle: 'aucun', nom: 'Sans groupe', couleur: '#c9d3d0', taches: sans });
    return sections;
  });

  function compte(sorte: Sorte | 'TOUT'): number {
    return donnees ? donnees.taches.filter((t) => sorte === 'TOUT' || t.kind === sorte).length : 0;
  }

  function quand(t: Tache): string {
    switch (t.kind) {
      case 'SCHEDULED':
        return repetitionEnClair(t.recurrence, t.dueTime);
      case 'BACKGROUND':
        return t.maxIntervalSeconds ? `À refaire dans les ${joursEnClair(t.maxIntervalSeconds)}` : 'Compte le temps écoulé';
      case 'ONE_OFF':
        return t.dueDate ? `Avant le ${new Date(`${t.dueDate}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}` : 'Sans date limite';
    }
  }

  /** La prochaine fois, et si elle est déjà passée. */
  function prochaine(t: Tache): { texte: string; retard: boolean } {
    if (!t.isActive) return { texte: 'En pause', retard: false };
    if (t.kind === 'BACKGROUND') {
      if (!t.lastDoneAt) return { texte: 'Jamais faite', retard: false };
      if (!t.nextDueAt) return { texte: '—', retard: false };
      const jour = jourDans(fuseau, new Date(t.nextDueAt));
      return { texte: prochaineFoisEnClair(jour, aujourdHui), retard: jour < aujourdHui };
    }
    const e = donnees?.prochaines.get(t.id);
    if (e?.scheduledFor) {
      return { texte: prochaineFoisEnClair(e.scheduledFor, aujourdHui, t.dueTime), retard: e.scheduledFor < aujourdHui };
    }
    if (t.kind === 'SCHEDULED') {
      const premier = t.startsOn ?? jourDans(fuseau, new Date(t.createdAt));
      const [suivante] = prochainesFois(t.recurrence, premier, aujourdHui > premier ? aujourdHui : premier, 1);
      if (suivante) return { texte: prochaineFoisEnClair(suivante.jour, aujourdHui, t.dueTime), retard: false };
    }
    return { texte: '—', retard: false };
  }

  /** Cocher depuis la liste : l'échéance due aujourd'hui ou en retard, ou « c'est fait » pour une tâche de fond. */
  function cochable(t: Tache): boolean {
    if (!peutCocher || !t.isActive) return false;
    if (t.kind === 'BACKGROUND') return true;
    const e = donnees?.prochaines.get(t.id);
    return !!e?.scheduledFor && ecartEnJours(aujourdHui, e.scheduledFor) <= 0;
  }

  async function cocher(t: Tache) {
    try {
      if (t.kind === 'BACKGROUND') {
        await api(`/tasks/${t.id}/done`, { method: 'POST', body: '{}' });
      } else {
        const e = donnees?.prochaines.get(t.id);
        if (!e) return;
        await api(`/occurrences/${e.id}/complete`, { method: 'POST', body: '{}' });
      }
      signalerUnChangement();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }
</script>

{#snippet boutons()}
  <button onclick={() => (nouveauGroupe = true)}><Icone nom="plus" taille={16} />Nouveau groupe</button>
{/snippet}

{#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

<div class="outils">
  <div class="filtres" role="group" aria-label="Type de tâche">
    {#each FILTRES as [valeur, libelle] (valeur)}
      <button class:actif={filtre === valeur} onclick={() => (filtre = valeur)}>{libelle} · {compte(valeur)}</button>
    {/each}
  </div>
  <label class="recherche">
    <Icone nom="chercher" taille={16} />
    <input type="search" placeholder="Chercher une tâche" bind:value={recherche} aria-label="Chercher une tâche" />
  </label>
  <select bind:value={groupeChoisi} aria-label="Groupe">
    <option value="">Tous les groupes</option>
    {#each donnees?.groupes ?? [] as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
    <option value="aucun">Sans groupe</option>
  </select>
</div>

<div class="tableau" role="table" aria-label="Tâches">
  <div class="rang titres" role="row">
    <div class="c-nom" role="columnheader">Tâche</div>
    <div class="c-quand" role="columnheader">Quand</div>
    <div class="c-prochaine" role="columnheader">Prochaine fois</div>
    <div class="c-qui" role="columnheader">Qui</div>
    <div class="c-prio" role="columnheader">Priorité</div>
  </div>
  {#if !donnees}
    <p class="muet vide">Chargement…</p>
  {:else if parGroupe.length === 0}
    <p class="muet vide">
      {donnees.taches.length === 0 ? 'Aucune tâche pour l’instant.' : 'Aucune tâche ne correspond.'}
    </p>
  {/if}
  {#each parGroupe as section (section.cle)}
    <div class="titre-groupe"><i style:background={section.couleur}></i>{section.nom}</div>
    {#each section.taches as t (t.id)}
      {@const p = priorite(t.priority)}
      {@const suite = prochaine(t)}
      <div class="rang" role="row" class:pause={!t.isActive}>
        <div class="c-nom" role="cell">
          <button
            class="case"
            disabled={!cochable(t)}
            aria-label={`C’est fait : ${t.title}`}
            title={cochable(t) ? 'C’est fait' : 'Rien à cocher pour l’instant'}
            onclick={() => cocher(t)}
          ></button>
          <button class="titre" onclick={() => (fiche = { tache: t })}>
            <b>{t.title}</b>
            {#if t.kind === 'BACKGROUND'}<span class="etiquette fond">De fond</span>{/if}
            {#if t.kind === 'ONE_OFF'}<span class="etiquette neutre">Ponctuelle</span>{/if}
          </button>
        </div>
        <div class="c-quand" role="cell">{quand(t)}</div>
        <div class="c-prochaine" role="cell" class:alerte={suite.retard}>{suite.texte}</div>
        <div class="c-qui" role="cell">
          {#if t.assignmentMode === 'ANYONE' || t.assignees.length === 0}
            <span class="muet">Quiconque</span>
          {:else}
            {#each t.assignees as id (id)}
              {@const m = donnees?.membres.get(id)}
              {#if m}<span title={m.firstName}><Photo membre={m} taille={24} /></span>{/if}
            {/each}
            {#if t.assignmentMode === 'ROTATION'}<span class="muet petit">tour à tour</span>{/if}
          {/if}
        </div>
        <div class="c-prio" role="cell">{#if p}<span class="etiquette {p.classe}">{p.libelle}</span>{/if}</div>
      </div>
    {/each}
  {/each}
</div>

{#if fiche && donnees}
  <FicheTache
    tache={fiche.tache}
    groupes={donnees.groupes}
    membres={[...donnees.membres.values()]}
    {aujourdHui}
    lectureSeule={!peutGerer}
    onFermer={() => (fiche = null)}
    onEnregistree={() => {
      fiche = null;
      signalerUnChangement();
    }}
  />
{/if}

{#if nouveauGroupe}
  <NouveauGroupe
    onFermer={() => (nouveauGroupe = false)}
    onCree={() => {
      nouveauGroupe = false;
      signalerUnChangement();
    }}
  />
{/if}

<style>
  .outils {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .filtres {
    flex: 1;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filtres button {
    min-height: 36px;
    border-radius: 999px;
    padding: 0 14px;
    font-size: 13px;
  }

  .filtres button.actif {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .recherche {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--trait-net);
    border-radius: 999px;
    padding: 0 14px;
    background: var(--surface);
    color: var(--gris);
    min-height: 38px;
    width: 240px;
  }

  .recherche input {
    border: none;
    background: transparent;
    outline: none;
    min-height: 0;
    padding: 0;
    flex: 1;
    min-width: 0;
  }

  select {
    width: auto;
  }

  .tableau {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    overflow: hidden;
  }

  .rang {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--trait);
    font-size: 14px;
  }

  .rang.titres {
    border-top: none;
    font-size: 11px;
    font-weight: 700;
    color: var(--gris);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--surface-douce);
  }

  .rang.pause {
    opacity: 0.6;
  }

  .c-nom {
    flex: 1.6;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .c-quand {
    flex: 1.2;
  }

  .c-prochaine {
    flex: 1;
  }

  .c-qui {
    flex: 0.9;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .c-prio {
    flex: 0 0 90px;
    text-align: right;
  }

  .alerte {
    color: var(--alerte-encre);
    font-weight: 600;
  }

  .petit {
    font-size: 12px;
    padding-left: 2px;
  }

  .titre-groupe {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px 6px;
    border-top: 1px solid var(--trait);
    font-size: 12px;
    font-weight: 700;
    color: var(--gris);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .titre-groupe i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: block;
  }

  .vide {
    padding: 22px 16px;
  }

  button.titre {
    border: none;
    background: transparent;
    padding: 0;
    min-height: 0;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
    font: inherit;
  }

  button.titre:hover b {
    color: var(--accent);
  }

  .case {
    flex: none;
    width: 22px;
    height: 22px;
    min-height: 0;
    padding: 0;
    border-radius: 7px;
    border: 2px solid var(--trait-net);
    background: var(--surface);
  }

  .case:disabled {
    opacity: 0.45;
  }

  .etiquette {
    flex: none;
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
    padding: 2px 9px;
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

  .etiquette.basse,
  .etiquette.neutre {
    color: var(--gris);
    background: var(--surface-douce);
    border: 1px solid var(--trait);
  }

  .etiquette.fond {
    color: var(--alerte-encre);
    background: var(--alerte-fond);
  }

  /* Sur téléphone : le nom, puis la règle et la prochaine fois dessous. */
  @media (max-width: 760px) {
    .rang.titres {
      display: none;
    }

    .rang {
      flex-wrap: wrap;
      gap: 4px 12px;
    }

    .c-nom {
      flex: 1 1 100%;
    }

    .c-quand,
    .c-prochaine {
      flex: 1 1 auto;
      font-size: 13px;
      padding-left: 34px;
    }

    .c-prochaine {
      padding-left: 0;
    }

    .c-qui,
    .c-prio {
      display: none;
    }

    .recherche {
      width: 100%;
    }
  }
</style>
