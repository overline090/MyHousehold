<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import { api, session } from '../../lib/session.svelte';
  import { jourDans, type Membre } from '../accueil/donnees';
  import Photo from '../Photo.svelte';
  import { heureLocale, versInstant } from './calendrier';

  /** Un rendez-vous : le créer, le lire ou le modifier. */
  let {
    id,
    jour,
    membres,
    lectureSeule,
    onFermer,
    onEnregistre,
  }: {
    id: string | null;
    jour: string;
    membres: Membre[];
    lectureSeule: boolean;
    onFermer: () => void;
    onEnregistre: () => void;
  } = $props();

  interface RendezVous {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startAt: string;
    endAt: string;
    isAllDay: boolean;
    rrule: string | null;
    visibility: 'HOUSEHOLD' | 'PRIVATE';
    attendees: { id: string }[];
  }

  type Repete = '' | 'FREQ=WEEKLY' | 'FREQ=MONTHLY' | 'FREQ=YEARLY' | 'autre';
  const REPETITIONS: [Repete, string][] = [
    ['', 'Une fois'],
    ['FREQ=WEEKLY', 'Chaque semaine'],
    ['FREQ=MONTHLY', 'Chaque mois'],
    ['FREQ=YEARLY', 'Chaque année'],
  ];

  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');

  /* svelte-ignore state_referenced_locally */
  const premierJour = jour;
  let titre = $state('');
  let lieu = $state('');
  let detail = $state('');
  let journee = $state(false);
  let debutJour = $state(premierJour);
  let debutHeure = $state(`${String(Math.min(new Date().getHours() + 1, 22)).padStart(2, '0')}:00`);
  let finJour = $state(premierJour);
  let finHeure = $state('');
  let repete = $state<Repete>('');
  let rruleExistante = $state<string | null>(null);
  let prive = $state(false);
  let invites = $state<string[]>([]);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  /* svelte-ignore state_referenced_locally */
  let charge = $state(id === null);
  let confirmer = $state(false);

  // Une heure de fin par défaut : une heure après le début.
  $effect(() => {
    if (!finHeure && debutHeure) {
      const [h, m] = debutHeure.split(':').map(Number);
      finHeure = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  });

  $effect(() => {
    if (!id) return;
    void (async () => {
      try {
        const r = await api<RendezVous>(`/appointments/${id}`);
        titre = r.title;
        lieu = r.location ?? '';
        detail = r.description ?? '';
        journee = r.isAllDay;
        debutJour = jourDans(fuseau, new Date(r.startAt));
        debutHeure = heureLocale(r.startAt, fuseau);
        finJour = jourDans(fuseau, new Date(new Date(r.endAt).getTime() - (r.isAllDay ? 1 : 0)));
        finHeure = heureLocale(r.endAt, fuseau);
        const connue = REPETITIONS.find(([v]) => v && r.rrule === v);
        repete = r.rrule ? (connue ? connue[0] : 'autre') : '';
        rruleExistante = r.rrule;
        prive = r.visibility === 'PRIVATE';
        invites = r.attendees.map((a) => a.id);
        charge = true;
      } catch (e) {
        erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
      }
    })();
  });

  const manque = $derived.by((): string | null => {
    if (!titre.trim()) return 'Donnez un titre au rendez-vous.';
    if (!debutJour || !finJour) return 'Choisissez les jours.';
    if (finJour < debutJour) return 'La fin vient avant le début.';
    if (!journee && finJour === debutJour && finHeure <= debutHeure) return 'La fin vient avant le début.';
    return null;
  });

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (manque || lectureSeule) return;
    envoi = true;
    erreur = null;
    const corps = {
      title: titre.trim(),
      // Une chaîne vide efface le lieu ou le détail ; null efface la répétition.
      location: lieu.trim(),
      description: detail.trim(),
      isAllDay: journee,
      startAt: journee ? versInstant(debutJour, '00:00') : versInstant(debutJour, debutHeure),
      // Une journée entière finit au début du lendemain.
      endAt: journee ? versInstant(addOne(finJour), '00:00') : versInstant(finJour, finHeure),
      ...(repete === 'autre' ? {} : { rrule: repete || null }),
      visibility: prive ? 'PRIVATE' : 'HOUSEHOLD',
      attendees: invites,
    };
    try {
      await api(id ? `/appointments/${id}` : '/appointments', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(corps),
      });
      onEnregistre();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

  function addOne(j: string): string {
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  async function supprimer() {
    if (!id) return;
    envoi = true;
    try {
      await api(`/appointments/${id}`, { method: 'DELETE' });
      onEnregistre();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
      envoi = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onFermer()} />

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<form class="panneau" onsubmit={enregistrer} aria-label={id ? titre || 'Rendez-vous' : 'Nouveau rendez-vous'}>
  <div class="tete-panneau">
    <h3>{id ? titre || '…' : 'Nouveau rendez-vous'}</h3>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>

  <fieldset class="corps-panneau" disabled={lectureSeule || !charge}>
    <label class="champ">Titre<input bind:value={titre} maxlength="200" required placeholder="Dentiste — Lou" /></label>
    <label class="champ">Lieu<input bind:value={lieu} maxlength="200" placeholder="Facultatif" /></label>

    <label class="case-a-cocher"><input type="checkbox" bind:checked={journee} /> Toute la journée</label>

    <div class="deux">
      <label class="champ">Début<input type="date" bind:value={debutJour} required /></label>
      {#if !journee}<label class="champ">Heure<input type="time" bind:value={debutHeure} required /></label>{/if}
    </div>
    <div class="deux">
      <label class="champ">Fin<input type="date" bind:value={finJour} required /></label>
      {#if !journee}<label class="champ">Heure<input type="time" bind:value={finHeure} required /></label>{/if}
    </div>

    <div class="champ">
      <span>Répétition</span>
      <div class="segment" role="group" aria-label="Répétition">
        {#each REPETITIONS as [valeur, libelle] (valeur)}
          <button type="button" class:actif={repete === valeur} onclick={() => (repete = valeur)}>{libelle}</button>
        {/each}
      </div>
      {#if repete === 'autre'}
        <span class="muet aide">Règle personnalisée ({rruleExistante}), gardée telle quelle.</span>
      {/if}
    </div>

    <div class="champ">
      <span>Qui</span>
      <div class="membres">
        {#each membres as m (m.id)}
          <button
            type="button"
            class="membre"
            class:actif={invites.includes(m.id)}
            aria-pressed={invites.includes(m.id)}
            onclick={() => (invites = invites.includes(m.id) ? invites.filter((x) => x !== m.id) : [...invites, m.id])}
          >
            <Photo membre={m} taille={24} />{m.firstName}
          </button>
        {/each}
      </div>
    </div>

    <label class="case-a-cocher">
      <input type="checkbox" bind:checked={prive} /> Privé — seules les personnes invitées le voient
    </label>

    <label class="champ">Détail<textarea bind:value={detail} rows="3" maxlength="2000" placeholder="Facultatif"></textarea></label>

    {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  </fieldset>

  <div class="pied-panneau">
    {#if lectureSeule}
      <span class="muet">Vous pouvez consulter ce rendez-vous, pas le modifier.</span>
      <span class="espace"></span>
      <button type="button" onclick={onFermer}>Fermer</button>
    {:else}
      {#if id}
        {#if confirmer}
          <button type="button" class="danger" disabled={envoi} onclick={supprimer}>Supprimer pour de bon</button>
        {:else}
          <button type="button" class="danger" onclick={() => (confirmer = true)}>Supprimer</button>
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
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .aide {
    font-size: 12px;
    font-weight: 400;
  }

  .case-a-cocher {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .case-a-cocher input {
    width: auto;
    min-height: 0;
  }

  .deux {
    display: flex;
    gap: 12px;
  }

  .deux .champ {
    flex: 1;
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

  .membres {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .membre {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
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

  textarea {
    font: inherit;
    font-weight: 400;
  }
</style>
