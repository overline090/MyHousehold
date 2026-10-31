<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { signalerUnChangement } from '../../lib/barre.svelte';
  import Icone from '../../lib/Icone.svelte';
  import { aLeDroit, api, session } from '../../lib/session.svelte';
  import { heureEnClair, jourDans, joursEnClair, priorite, type Membre } from '../accueil/donnees';
  import DetailsRiches from './DetailsRiches.svelte';
  import type { Tache } from './donnees';
  import { dateEnClair, ecartEnJours, heureCourte, repetitionEnClair } from './regles';

  /**
   * Une tâche ouverte : où elle en est, la valider (« C'est fait »,
   * « Passer cette fois »), ses détails, les dernières fois et par qui.
   */
  let {
    tacheId,
    membres,
    onFermer,
    onModifier,
  }: {
    tacheId: string;
    membres: Map<string, Membre>;
    onFermer: () => void;
    onModifier?: (t: Tache) => void;
  } = $props();

  interface Personne {
    id: string;
    firstName: string;
    lastName: string;
  }
  interface Fois {
    id: string;
    scheduledFor: string | null;
    dueAt: string | null;
    status: 'PENDING' | 'DONE' | 'MISSED' | 'SKIPPED';
    completedAt: string | null;
    assignee?: Personne | null;
    assigneeId?: string | null;
    completedBy?: Personne | null;
    late?: boolean;
  }
  type Detail = Tache & { upcoming?: Fois[]; history?: Fois[] };

  const fuseau = $derived(session.foyer?.timezone ?? 'Europe/Paris');
  const aujourdHui = $derived(jourDans(fuseau));
  const peutCocher = $derived(aLeDroit('COMPLETE_TASKS'));
  const peutGerer = $derived(aLeDroit('MANAGE_TASKS'));

  let t = $state<Detail | null>(null);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);

  async function charger() {
    try {
      t = await api<Detail>(`/tasks/${tacheId}`);
      erreur = null;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void tacheId;
    void charger();
  });

  function prenom(id: string | null | undefined): string | null {
    return id ? (membres.get(id)?.firstName ?? null) : null;
  }

  /** Où en est la tâche aujourd'hui, et ce qu'on peut y faire. */
  const etat = $derived.by(() => {
    if (!t) return null;
    if (!t.isActive) return { texte: 'En pause', classe: 'neutre', actions: false as const };
    if (t.kind === 'BACKGROUND') {
      const jours = t.elapsedSeconds != null ? joursEnClair(t.elapsedSeconds) : null;
      const texte = !t.lastDoneAt ? 'Jamais faite' : `Faite il y a ${jours}`;
      const classe = t.state === 'OVERDUE' ? 'retard' : t.state === 'DUE_SOON' ? 'bientot' : 'fait';
      return {
        texte: t.state === 'OVERDUE' ? `${texte} — en retard` : texte,
        classe,
        actions: 'fond' as const,
      };
    }
    const enAttente = (t.upcoming ?? []).filter((o) => o.status === 'PENDING' && o.scheduledFor);
    const due = enAttente.find((o) => o.scheduledFor! <= aujourdHui);
    const faiteAujourdHui = (t.history ?? []).find((o) => o.status === 'DONE' && o.scheduledFor === aujourdHui);
    if (due) {
      const retard = ecartEnJours(due.scheduledFor!, aujourdHui);
      const qui = prenom(due.assigneeId);
      const heure = heureCourte(t.dueTime);
      return {
        texte:
          retard > 0
            ? `En retard de ${retard} ${retard > 1 ? 'jours' : 'jour'}`
            : `À faire aujourd’hui${heure ? `, ${heure}` : ''}`,
        classe: retard > 0 ? 'retard' : 'afaire',
        qui: qui ? (t.assignmentMode === 'ROTATION' ? `c’est le tour de ${qui}` : `pour ${qui}`) : null,
        actions: 'due' as const,
        occurrence: due,
      };
    }
    if (faiteAujourdHui) {
      return {
        texte: `Faite à ${faiteAujourdHui.completedAt ? heureEnClair(faiteAujourdHui.completedAt, fuseau) : ''}${faiteAujourdHui.completedBy ? ` · ${faiteAujourdHui.completedBy.firstName}` : ''}`,
        classe: 'fait',
        actions: 'faite' as const,
        occurrence: faiteAujourdHui,
      };
    }
    if (t.kind === 'ONE_OFF') {
      const faite = (t.history ?? []).find((o) => o.status === 'DONE');
      if (faite?.completedAt) {
        return {
          texte: `Faite le ${dateEnClair(jourDans(fuseau, new Date(faite.completedAt)), aujourdHui).toLowerCase()}`,
          classe: 'fait',
          actions: 'faite' as const,
          occurrence: faite,
        };
      }
    }
    const suivante = enAttente[0];
    if (suivante?.scheduledFor) {
      const commence = t.startsOn && t.startsOn > aujourdHui && !(t.history ?? []).length;
      return {
        texte: `${commence ? 'Commence' : 'Prochaine fois'} ${dateEnClair(suivante.scheduledFor, aujourdHui).toLowerCase()}`,
        classe: 'neutre',
        qui: prenom(suivante.assigneeId),
        actions: false as const,
      };
    }
    return { texte: 'Rien de prévu', classe: 'neutre', actions: false as const };
  });

  async function agir(chemin: string) {
    envoi = true;
    try {
      await api(chemin, { method: 'POST', body: '{}' });
      signalerUnChangement();
      await charger();
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    } finally {
      envoi = false;
    }
  }

  /** Cocher une case des détails : seul qui gère les tâches change le texte. */
  async function basculerCase(index: number, cochee: boolean) {
    if (!t?.description) return;
    const doc = new DOMParser().parseFromString(t.description, 'text/html');
    const li = doc.querySelectorAll('li[data-case]')[index] as HTMLElement | undefined;
    if (!li) return;
    li.dataset.case = cochee ? 'oui' : 'non';
    const description = doc.body.innerHTML;
    try {
      await api(`/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ description }) });
      t.description = description;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  function quand(f: Fois): string {
    const jour = f.scheduledFor ?? (f.completedAt ? jourDans(fuseau, new Date(f.completedAt)) : null);
    const date = jour ? dateEnClair(jour, aujourdHui) : '';
    const heure = f.status === 'DONE' && f.completedAt ? heureEnClair(f.completedAt, fuseau) : null;
    return heure ? `${date} · ${heure}` : date;
  }

  const ETATS: Record<Fois['status'], [string, string]> = {
    DONE: ['✓ Faite', 'fait'],
    MISSED: ['Manquée', 'manquee'],
    SKIPPED: ['Passée', 'neutre'],
    PENDING: ['À faire', 'afaire'],
  };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onFermer()} />

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<aside class="panneau" aria-label={t?.title ?? 'Tâche'}>
  <div class="tete-panneau">
    <h3>{t?.title ?? '…'}</h3>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>

  <div class="corps-panneau">
    {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
    {#if t}
      {@const p = priorite(t.priority)}
      <div class="entete">
        {#if p}<span class="etiquette {p.classe}">{p.libelle}</span>{/if}
        {#if t.group}<span class="groupe"><i style:background={t.group.color}></i>{t.group.name}</span>{/if}
        <span class="muet">
          {t.kind === 'SCHEDULED'
            ? repetitionEnClair(t.recurrence, t.dueTime)
            : t.kind === 'BACKGROUND'
              ? t.maxIntervalSeconds
                ? `À refaire dans les ${joursEnClair(t.maxIntervalSeconds)}`
                : 'Compte le temps écoulé'
              : t.dueDate
                ? `Avant le ${dateEnClair(t.dueDate, aujourdHui).toLowerCase()}`
                : 'Sans date limite'}
          {t.assignmentMode === 'ROTATION' ? ' · tour de rôle' : ''}
        </span>
      </div>

      {#if etat}
        <div class="etat-boite" class:active={etat.actions === 'due' || etat.actions === 'fond'}>
          <div class="ligne-etat">
            <span class="etat {etat.classe}">{etat.texte}</span>
            {#if 'qui' in etat && etat.qui}<span class="muet">{etat.qui}</span>{/if}
          </div>
          {#if peutCocher && etat.actions === 'due' && 'occurrence' in etat}
            <div class="boutons-etat">
              <button class="primaire" disabled={envoi} onclick={() => agir(`/occurrences/${etat.occurrence!.id}/complete`)}>✓ C’est fait</button>
              {#if t.kind === 'SCHEDULED'}
                <button disabled={envoi} onclick={() => agir(`/occurrences/${etat.occurrence!.id}/skip`)}>Passer cette fois</button>
              {/if}
            </div>
          {:else if peutCocher && etat.actions === 'fond'}
            <div class="boutons-etat">
              <button class="primaire" disabled={envoi} onclick={() => agir(`/tasks/${t!.id}/done`)}>✓ C’est fait</button>
            </div>
          {:else if peutCocher && etat.actions === 'faite' && 'occurrence' in etat}
            <button class="lien" disabled={envoi} onclick={() => agir(`/occurrences/${etat.occurrence!.id}/uncomplete`)}>Annuler : pas encore faite</button>
          {/if}
        </div>
      {/if}

      {#if t.description}
        <div class="champ">
          <span>Détails</span>
          <DetailsRiches html={t.description} onCase={peutGerer ? basculerCase : undefined} />
        </div>
      {/if}

      {#if t.history?.length}
        <div class="champ">
          <span>Les dernières fois</span>
          <div class="historique">
            {#each t.history as f (f.id)}
              {@const [libelle, classe] = ETATS[f.status ?? 'DONE']}
              <div class="fois">
                <span class="etat {classe}">{libelle}</span>
                <span class="quand">{quand(f)}</span>
                <span class="muet">
                  {f.status === 'DONE' ? (f.completedBy?.firstName ?? '') : (f.assignee?.firstName ?? '')}{f.late ? ' · en retard' : ''}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if t.kind !== 'BACKGROUND' && (t.upcoming ?? []).filter((o) => o.scheduledFor && o.scheduledFor > aujourdHui).length}
        <div class="champ">
          <span>Les prochaines fois</span>
          <p class="muet">
            {(t.upcoming ?? [])
              .filter((o) => o.scheduledFor && o.scheduledFor > aujourdHui)
              .slice(0, 3)
              .map((o) => `${dateEnClair(o.scheduledFor!, aujourdHui)}${prenom(o.assigneeId) ? ` — ${prenom(o.assigneeId)}` : ''}`)
              .join(' · ')}
          </p>
        </div>
      {/if}
    {:else if !erreur}
      <p class="muet">Chargement…</p>
    {/if}
  </div>

  <div class="pied-panneau">
    {#if peutGerer && onModifier && t}
      <button onclick={() => onModifier!(t!)}>Modifier</button>
    {/if}
    <span class="espace"></span>
    <button onclick={onFermer}>Fermer</button>
  </div>
</aside>

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
    gap: 16px;
  }

  .pied-panneau {
    display: flex;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--trait);
  }

  .espace {
    flex: 1;
  }

  .entete {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 13px;
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

  .etat-boite {
    border: 1px solid var(--trait);
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-douce);
  }

  .etat-boite.active {
    background: var(--accent-doux);
    border-color: var(--accent-trait);
  }

  .ligne-etat {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 13px;
  }

  .boutons-etat {
    display: flex;
    gap: 10px;
  }

  .boutons-etat .primaire {
    flex: 1;
  }

  button.lien {
    align-self: flex-start;
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
  }

  .etat {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
    white-space: nowrap;
  }

  .etat.fait {
    background: #dcfce7;
    color: #166534;
  }

  .etat.afaire {
    background: var(--surface);
    color: var(--accent-sombre);
  }

  .etat.retard,
  .etat.bientot {
    background: #fef3e2;
    color: #9a3412;
  }

  .etat.manquee {
    background: #fee2e2;
    color: #991b1b;
  }

  .etat.neutre {
    background: var(--surface);
    color: var(--gris);
    border: 1px solid var(--trait);
  }

  .champ {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .champ > span {
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .historique {
    border: 1px solid var(--trait);
    border-radius: 12px;
    overflow: hidden;
  }

  .fois {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    font-size: 13px;
    border-top: 1px solid var(--trait);
  }

  .fois:first-child {
    border-top: none;
  }

  .quand {
    flex: 1;
  }

  .etiquette {
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
    padding: 2px 9px;
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
    border: 1px solid var(--trait);
  }
</style>
