<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import { api } from '../../lib/session.svelte';
  import type { Membre } from '../accueil/donnees';
  import Photo from '../Photo.svelte';
  import type { Groupe, ModeQui, Sorte, Tache } from './donnees';
  import { dateEnClair, heureCourte, JOURS, JOURS_COURTS, prochainesFois, type Jour, type Repetition } from './regles';

  /**
   * La fiche d'une tâche, en panneau : la créer ou la modifier. Le type
   * décide des champs ; l'aperçu des trois prochaines fois suit la saisie.
   */
  let {
    tache,
    groupes,
    membres,
    aujourdHui,
    lectureSeule,
    onFermer,
    onEnregistree,
  }: {
    tache: Tache | null;
    groupes: Groupe[];
    membres: Membre[];
    aujourdHui: string;
    lectureSeule: boolean;
    onFermer: () => void;
    onEnregistree: () => void;
  } = $props();

  type Forme = 'DAILY' | 'WEEKDAYS' | 'MONTH_DAYS' | 'YEAR_DATES' | 'EVERY_N';
  const FORMES: [Forme, string][] = [
    ['DAILY', 'Jours'],
    ['WEEKDAYS', 'Semaine'],
    ['MONTH_DAYS', 'Mois'],
    ['YEAR_DATES', 'Année'],
    ['EVERY_N', 'Toutes les N'],
  ];
  const SORTES: [Sorte, string][] = [
    ['SCHEDULED', 'Récurrente'],
    ['BACKGROUND', 'De fond'],
    ['ONE_OFF', 'Ponctuelle'],
  ];
  const PRIORITES: [number, string][] = [
    [3, 'Urgente'],
    [2, 'Très haute'],
    [1, 'Haute'],
    [0, 'Normale'],
    [-1, 'Basse'],
    [-2, 'Très basse'],
    [-3, 'En dernier'],
  ];

  // L'état de départ vient de la tâche ouverte : la fiche est recréée à
  // chaque ouverture, elle n'a pas à suivre `tache` ensuite.
  /* svelte-ignore state_referenced_locally */
  const depart = tache;
  /* svelte-ignore state_referenced_locally */
  const ceJour = aujourdHui;
  const r = depart?.recurrence ?? null;

  let sorte = $state<Sorte>(depart?.kind ?? 'SCHEDULED');
  let titre = $state(depart?.title ?? '');
  let detail = $state(depart?.description ?? '');
  /** null : une règle que les cinq formes ne savent pas dire — gardée telle quelle tant qu'on n'y touche pas. */
  let forme = $state<Forme | null>(depart && depart.kind === 'SCHEDULED' ? (r?.form ?? null) : 'DAILY');
  let intervalle = $state(r && (r.form === 'DAILY' || r.form === 'EVERY_N') ? (r.interval ?? 1) : 1);
  let unite = $state<'WEEK' | 'MONTH'>(r?.form === 'EVERY_N' ? r.unit : 'WEEK');
  let joursSemaine = $state<Jour[]>(r?.form === 'WEEKDAYS' ? [...r.days] : [JOURS[(new Date(`${ceJour}T12:00:00Z`).getUTCDay() + 6) % 7]]);
  let joursMois = $state<number[]>(r?.form === 'MONTH_DAYS' ? [...r.days] : [Number(ceJour.slice(8))]);
  let datesAnnee = $state<string[]>(r?.form === 'YEAR_DATES' ? [...r.dates] : [ceJour.slice(5)]);
  let nouvelleDate = $state('');
  let heure = $state(depart?.dueTime ?? '');
  let premier = $state(depart?.startsOn ?? (depart ? depart.createdAt.slice(0, 10) : ceJour));
  let delaiJours = $state<number | null>(depart?.maxIntervalSeconds ? Math.round(depart.maxIntervalSeconds / 86_400) : 14);
  let dateLimite = $state(depart?.dueDate ?? '');
  let groupe = $state(depart?.group?.id ?? '');
  let prio = $state(depart?.priority ?? 0);
  let mode = $state<ModeQui>(depart?.assignmentMode ?? 'ANYONE');
  let qui = $state<string[]>(depart ? [...depart.assignees] : []);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  let confirmerSuppression = $state(false);

  const repetition = $derived.by((): Repetition | null => {
    switch (forme) {
      case 'DAILY':
        return { form: 'DAILY', interval: intervalle };
      case 'WEEKDAYS':
        return { form: 'WEEKDAYS', days: joursSemaine };
      case 'MONTH_DAYS':
        return { form: 'MONTH_DAYS', days: joursMois };
      case 'YEAR_DATES':
        return { form: 'YEAR_DATES', dates: datesAnnee };
      case 'EVERY_N':
        return { form: 'EVERY_N', unit: unite, interval: intervalle };
      default:
        return null;
    }
  });

  const intervalleValide = $derived(Number.isInteger(intervalle) && intervalle >= 1 && intervalle <= 365);

  const apercu = $derived(
    sorte === 'SCHEDULED' && premier && intervalleValide
      ? prochainesFois(repetition, premier, premier > aujourdHui ? premier : aujourdHui, 3)
      : [],
  );

  function quiPour(rang: number): string | null {
    const ids = mode === 'ROTATION' ? qui : mode === 'FIXED' ? qui.slice(0, 1) : [];
    if (!ids.length) return null;
    return membres.find((m) => m.id === ids[rang % ids.length])?.firstName ?? null;
  }

  function basculer<T>(liste: T[], valeur: T): T[] {
    return liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
  }

  function choisirQui(id: string) {
    if (mode === 'FIXED') qui = qui[0] === id ? [] : [id];
    else qui = basculer(qui, id);
  }

  function changerMode(m: ModeQui) {
    mode = m;
    if (m === 'ANYONE') qui = [];
    if (m === 'FIXED') qui = qui.slice(0, 1);
  }

  function ajouterDateAnnee() {
    if (!nouvelleDate) return;
    const mmjj = nouvelleDate.slice(5);
    if (!datesAnnee.includes(mmjj)) datesAnnee = [...datesAnnee, mmjj].sort();
    nouvelleDate = '';
  }

  /** Ce qui manque avant de pouvoir enregistrer, dit en clair. */
  const manque = $derived.by((): string | null => {
    if (!titre.trim()) return 'Donnez un titre à la tâche.';
    if (sorte === 'SCHEDULED') {
      if (!premier) return 'Choisissez le premier jour.';
      if ((forme === 'DAILY' || forme === 'EVERY_N') && !intervalleValide) return 'Le nombre va de 1 à 365.';
      if (forme === 'WEEKDAYS' && joursSemaine.length === 0) return 'Choisissez au moins un jour de la semaine.';
      if (forme === 'MONTH_DAYS' && joursMois.length === 0) return 'Choisissez au moins un jour du mois.';
      if (forme === 'YEAR_DATES' && datesAnnee.length === 0) return 'Ajoutez au moins une date.';
    }
    if (sorte === 'BACKGROUND' && delaiJours !== null && (!Number.isInteger(delaiJours) || delaiJours < 1)) {
      return 'Le délai se compte en jours entiers, au moins 1.';
    }
    if (mode === 'FIXED' && qui.length !== 1) return 'Choisissez la personne.';
    if (mode === 'ROTATION' && qui.length < 2) return 'Un tour de rôle se fait à deux au moins.';
    return null;
  });

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (manque || lectureSeule) return;
    envoi = true;
    erreur = null;
    const corps: Record<string, unknown> = {
      title: titre.trim(),
      description: detail.trim(),
      groupId: groupe || null,
      priority: prio,
      assignmentMode: mode,
      assignees: mode === 'ANYONE' ? [] : qui,
    };
    if (!depart) corps.kind = sorte;
    if (sorte === 'SCHEDULED') {
      if (repetition) corps.recurrence = repetition;
      corps.dueTime = heure || null;
      corps.startsOn = premier;
    } else if (sorte === 'BACKGROUND') {
      corps.maxIntervalSeconds = delaiJours ? delaiJours * 86_400 : null;
    } else {
      corps.dueDate = dateLimite || null;
    }
    try {
      await api(depart ? `/tasks/${depart.id}` : '/tasks', {
        method: depart ? 'PATCH' : 'POST',
        body: JSON.stringify(corps),
      });
      onEnregistree();
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
      await api(`/tasks/${depart.id}`, { method: 'DELETE' });
      onEnregistree();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
      envoi = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onFermer()} />

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<form class="panneau" onsubmit={enregistrer} aria-label={depart ? depart.title : 'Nouvelle tâche'}>
  <div class="tete-panneau">
    <h3>{depart ? depart.title : 'Nouvelle tâche'}</h3>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>

  <fieldset class="corps-panneau" disabled={lectureSeule}>
    <div class="champ">
      <span>Type</span>
      <div class="segment" role="group" aria-label="Type">
        {#each SORTES as [valeur, libelle] (valeur)}
          <button
            type="button"
            class:actif={sorte === valeur}
            disabled={!!depart && sorte !== valeur}
            title={depart && sorte !== valeur ? 'Le type d’une tâche ne se change pas' : undefined}
            onclick={() => {
              sorte = valeur;
              if (valeur !== 'SCHEDULED' && mode === 'ROTATION') changerMode('ANYONE');
            }}>{libelle}</button
          >
        {/each}
      </div>
    </div>

    <label class="champ">Titre<input bind:value={titre} maxlength="120" required /></label>

    {#if sorte === 'SCHEDULED'}
      <div class="champ">
        <span>Répétition</span>
        <div class="segment" role="group" aria-label="Répétition">
          {#each FORMES as [valeur, libelle] (valeur)}
            <button type="button" class:actif={forme === valeur} onclick={() => (forme = valeur)}>{libelle}</button>
          {/each}
        </div>

        {#if forme === null}
          <p class="muet aide">
            Cette tâche suit une règle personnalisée, gardée telle quelle. Choisissez une forme ci-dessus pour la
            remplacer.
          </p>
        {:else if forme === 'DAILY'}
          <div class="ligne-saisie">
            Tous les
            <input class="nombre" type="number" min="1" max="365" step="1" bind:value={intervalle} aria-label="Nombre de jours" />
            {intervalle > 1 ? 'jours' : 'jour'}
          </div>
          <p class="muet aide">1 = chaque jour, 2 = un jour sur deux… jusqu’à 365.</p>
        {:else if forme === 'WEEKDAYS'}
          <div class="puces-jours" role="group" aria-label="Jours de la semaine">
            {#each JOURS as j (j)}
              <button type="button" class:actif={joursSemaine.includes(j)} aria-pressed={joursSemaine.includes(j)} aria-label={j} onclick={() => (joursSemaine = basculer(joursSemaine, j))}>{JOURS_COURTS[j]}</button>
            {/each}
          </div>
        {:else if forme === 'MONTH_DAYS'}
          <div class="grille-mois" role="group" aria-label="Jours du mois">
            {#each Array.from({ length: 31 }, (_, k) => k + 1) as j (j)}
              <button type="button" class:actif={joursMois.includes(j)} onclick={() => (joursMois = basculer(joursMois, j))}>{j}</button>
            {/each}
            <button type="button" class="dernier" class:actif={joursMois.includes(-1)} onclick={() => (joursMois = basculer(joursMois, -1))}>Dernier jour</button>
          </div>
        {:else if forme === 'YEAR_DATES'}
          <div class="dates">
            {#each datesAnnee as d (d)}
              <span class="puce">{dateEnClair(`2001-${d}`).split(' ').slice(1).join(' ')}<button type="button" aria-label="Retirer" onclick={() => (datesAnnee = datesAnnee.filter((x) => x !== d))}>×</button></span>
            {/each}
            <input type="date" bind:value={nouvelleDate} aria-label="Date à ajouter" />
            <button type="button" onclick={ajouterDateAnnee} disabled={!nouvelleDate}>Ajouter</button>
          </div>
          <p class="muet aide">Le jour et le mois comptent, pas l’année : la tâche revient chaque année.</p>
        {:else}
          <div class="ligne-saisie">
            {unite === 'WEEK' ? 'Toutes les' : 'Tous les'}
            <input class="nombre" type="number" min="1" max="365" step="1" bind:value={intervalle} aria-label="Nombre" />
            <select bind:value={unite} aria-label="Unité">
              <option value="WEEK">semaines</option>
              <option value="MONTH">mois</option>
            </select>
          </div>
          <p class="muet aide">Le même jour que le premier jour : sa semaine, ou sa date dans le mois.</p>
        {/if}

        <div class="ligne-saisie">
          à
          <input type="time" bind:value={heure} aria-label="Heure" />
          {#if heure}
            <button type="button" class="lien" onclick={() => (heure = '')}>Toute la journée</button>
          {:else}
            <span class="muet">toute la journée</span>
          {/if}
        </div>
      </div>

      <label class="champ">
        Premier jour
        <input type="date" bind:value={premier} required />
        <span class="muet aide">La série compte à partir de ce jour-là — il peut être dans le futur.</span>
      </label>

      <div class="apercu" aria-live="polite">
        <b>Les trois prochaines fois</b>
        {#each apercu as fois (fois.jour)}
          {@const nom = quiPour(fois.rang)}
          <span>{dateEnClair(fois.jour, aujourdHui)}{heure ? `, ${heureCourte(heure)}` : ''}{nom ? ` — ${nom}` : ''}</span>
        {:else}
          <span class="muet">{forme === null ? 'Selon la règle personnalisée.' : 'Complétez la répétition.'}</span>
        {/each}
      </div>
    {:else if sorte === 'BACKGROUND'}
      <div class="champ">
        <span>À refaire dans les</span>
        <div class="ligne-saisie">
          <input class="nombre" type="number" min="1" step="1" bind:value={delaiJours} aria-label="Délai en jours" />
          jours
          {#if delaiJours !== null}
            <button type="button" class="lien" onclick={() => (delaiJours = null)}>Sans délai</button>
          {/if}
        </div>
        <p class="muet aide">
          {delaiJours === null
            ? 'Sans délai, la tâche compte le temps écoulé sans jamais être en retard.'
            : 'Le temps repart de zéro chaque fois qu’on la déclare faite.'}
        </p>
      </div>
    {:else}
      <label class="champ">
        Date limite
        <div class="ligne-saisie">
          <input type="date" bind:value={dateLimite} />
          {#if dateLimite}
            <button type="button" class="lien" onclick={() => (dateLimite = '')}>Sans date limite</button>
          {:else}
            <span class="muet">sans date limite</span>
          {/if}
        </div>
      </label>
    {/if}

    <div class="deux">
      <label class="champ">
        Groupe
        <select bind:value={groupe}>
          <option value="">Sans groupe</option>
          {#each groupes as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
        </select>
      </label>
      <label class="champ">
        Priorité
        <select bind:value={prio}>
          {#each PRIORITES as [valeur, libelle] (valeur)}<option value={valeur}>{libelle}</option>{/each}
        </select>
      </label>
    </div>

    <div class="champ">
      <span>Qui</span>
      <div class="segment" role="group" aria-label="Qui">
        <button type="button" class:actif={mode === 'ANYONE'} onclick={() => changerMode('ANYONE')}>Quiconque</button>
        <button type="button" class:actif={mode === 'FIXED'} onclick={() => changerMode('FIXED')}>Une personne</button>
        {#if sorte === 'SCHEDULED'}
          <button type="button" class:actif={mode === 'ROTATION'} onclick={() => changerMode('ROTATION')}>Tour à tour</button>
        {/if}
      </div>
      {#if mode !== 'ANYONE'}
        <div class="membres">
          {#each membres as m (m.id)}
            {@const rang = qui.indexOf(m.id)}
            <button type="button" class="membre" class:actif={rang >= 0} aria-pressed={rang >= 0} onclick={() => choisirQui(m.id)}>
              <Photo membre={m} taille={26} />
              {m.firstName}
              {#if mode === 'ROTATION' && rang >= 0}<span class="rang">{rang + 1}</span>{/if}
            </button>
          {/each}
        </div>
        {#if mode === 'ROTATION'}<p class="muet aide">L’ordre du tour est l’ordre dans lequel vous les choisissez.</p>{/if}
      {/if}
    </div>

    <label class="champ">Détail<textarea bind:value={detail} rows="2" maxlength="2000" placeholder="Facultatif"></textarea></label>

    {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  </fieldset>

  <div class="pied-panneau">
    {#if lectureSeule}
      <span class="muet">Vous pouvez consulter cette tâche, pas la modifier.</span>
      <button type="button" onclick={onFermer}>Fermer</button>
    {:else}
      {#if depart}
        {#if confirmerSuppression}
          <button type="button" class="danger" disabled={envoi} onclick={supprimer}>Supprimer pour de bon</button>
        {:else}
          <button type="button" class="danger" onclick={() => (confirmerSuppression = true)}>Supprimer</button>
        {/if}
      {/if}
      <span class="espace"></span>
      <button type="button" onclick={onFermer}>Annuler</button>
      <button type="submit" class="primaire" disabled={envoi || !!manque} title={manque ?? undefined}>Enregistrer</button>
    {/if}
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
    padding: 16px 20px;
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
    gap: 14px;
    border: none;
    margin: 0;
    min-width: 0;
  }

  .pied-panneau {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 14px 20px;
    border-top: 1px solid var(--trait);
  }

  .espace {
    flex: 1;
  }

  .danger {
    color: #b91c1c;
  }

  .champ {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .aide {
    font-size: 12px;
    font-weight: 400;
    margin: 0;
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
    padding: 0 4px;
    font-size: 13px;
    white-space: nowrap;
  }

  .segment button + button {
    border-left: 1px solid var(--trait-net);
  }

  .segment button.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  .segment button:disabled:not(.actif) {
    color: var(--gris);
    opacity: 0.6;
  }

  .ligne-saisie {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 400;
    color: var(--encre);
    flex-wrap: wrap;
  }

  .nombre {
    width: 76px;
    text-align: center;
    font-weight: 700;
  }

  .ligne-saisie select,
  .ligne-saisie input[type='time'],
  .ligne-saisie input[type='date'] {
    width: auto;
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

  .puces-jours {
    display: flex;
    gap: 6px;
  }

  .puces-jours button {
    width: 36px;
    height: 36px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    font-weight: 600;
  }

  .puces-jours button.actif,
  .grille-mois button.actif {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .grille-mois {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  .grille-mois button {
    min-height: 32px;
    padding: 0;
    font-size: 13px;
  }

  .grille-mois .dernier {
    grid-column: span 4;
  }

  .dates {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .dates input {
    width: auto;
  }

  .puce {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--accent);
    background: var(--accent-doux);
    color: var(--accent-sombre);
    border-radius: 999px;
    padding: 3px 4px 3px 12px;
    font-size: 13px;
  }

  .puce button {
    min-height: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: transparent;
  }

  .apercu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface-douce);
    border: 1px solid var(--trait);
  }

  .apercu b {
    font-size: 12px;
    color: var(--gris);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .deux {
    display: flex;
    gap: 12px;
  }

  .deux .champ {
    flex: 1;
  }

  .membres {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .membre {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px 0 5px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
  }

  .membre.actif {
    border-color: var(--accent);
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  .rang {
    background: var(--accent);
    color: #fff;
    border-radius: 999px;
    font-size: 11px;
    min-width: 18px;
    text-align: center;
  }

  textarea {
    font: inherit;
    font-weight: 400;
  }
</style>
