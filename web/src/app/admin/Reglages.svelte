<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { api, session, type Foyer } from '../../lib/session.svelte';
  import NouveauGroupe from '../taches/NouveauGroupe.svelte';
  import PastilleGroupe from '../../lib/PastilleGroupe.svelte';
  import CopieAutomatique from './CopieAutomatique.svelte';

  /** Administration › Réglages du foyer : le foyer, l'arrivée des nouveaux membres, les groupes de tâches. */
  interface Statut {
    id: string;
    name: string;
    isDefault: boolean;
  }
  interface Groupe {
    id: string;
    name: string;
    color: string;
    icon?: string | null;
    position: number;
  }
  type FoyerComplet = Foyer & { registrationOpen?: boolean; inviteTtlHours?: number };

  const FUSEAUX = (Intl as unknown as { supportedValuesOf?: (c: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['Europe/Paris'];

  let nom = $state(session.foyer?.name ?? '');
  let fuseau = $state(session.foyer?.timezone ?? 'Europe/Paris');
  let debut = $state(session.foyer?.weekStartsOn ?? 1);
  let ouvertes = $state(false);
  let duree = $state(168);
  let statuts = $state<Statut[]>([]);
  let groupes = $state<Groupe[]>([]);
  let parGroupe = $state<Map<string, number>>(new Map());
  let message = $state<{ texte: string; erreur: boolean } | null>(null);
  let envoi = $state(false);
  let nouveauGroupe = $state(false);
  let edition = $state<Groupe | null>(null);

  async function charger() {
    try {
      const [f, s, g, t] = await Promise.all([
        api<FoyerComplet>('/household'),
        api<Statut[]>('/statuses'),
        api<Groupe[]>('/task-groups'),
        api<{ group: { id: string } | null }[]>('/tasks'),
      ]);
      nom = f.name;
      fuseau = f.timezone;
      debut = f.weekStartsOn ?? 1;
      ouvertes = f.registrationOpen ?? false;
      duree = f.inviteTtlHours ?? 168;
      statuts = s;
      groupes = g.sort((a, b) => a.position - b.position);
      const compte = new Map<string, number>();
      for (const x of t) if (x.group) compte.set(x.group.id, (compte.get(x.group.id) ?? 0) + 1);
      parGroupe = compte;
    } catch (e) {
      message = { texte: e instanceof ApiError ? e.message : 'Le serveur ne répond pas.', erreur: true };
    }
  }

  $effect(() => {
    void charger();
  });

  async function faire(action: () => Promise<unknown>, reussite = 'Enregistré.') {
    envoi = true;
    try {
      await action();
      message = { texte: reussite, erreur: false };
      await charger();
    } catch (e) {
      message = { texte: e instanceof ApiError ? e.message : 'Le serveur ne répond pas.', erreur: true };
    } finally {
      envoi = false;
    }
  }

  const enregistrer = () =>
    faire(async () => {
      const f = await api<FoyerComplet>('/household', {
        method: 'PATCH',
        body: JSON.stringify({ name: nom.trim(), timezone: fuseau, weekStartsOn: debut, registrationOpen: ouvertes, inviteTtlHours: duree }),
      });
      if (session.foyer) Object.assign(session.foyer, { name: f.name, timezone: f.timezone, weekStartsOn: f.weekStartsOn });
    });

  const statutParDefaut = (id: string) =>
    faire(() => api(`/statuses/${id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }));

  const deplacer = (index: number, sens: -1 | 1) =>
    faire(async () => {
      const ordre = [...groupes];
      const [g] = ordre.splice(index, 1);
      ordre.splice(index + sens, 0, g);
      await Promise.all(ordre.map((x, i) => api(`/task-groups/${x.id}`, { method: 'PATCH', body: JSON.stringify({ position: i }) })));
    }, 'Ordre enregistré.');
</script>

<div class="pile">
  <div class="cartes">
    <section class="carte">
      <h3>Le foyer</h3>
      <label>Nom du foyer<input bind:value={nom} maxlength="80" /></label>
      <div class="deux">
        <label>
          Fuseau horaire
          <select bind:value={fuseau}>
            {#each FUSEAUX as f (f)}<option value={f}>{f}</option>{/each}
          </select>
        </label>
        <div class="champ">
          <span>La semaine commence</span>
          <div class="segment">
            <button class:actif={debut === 1} onclick={() => (debut = 1)}>Lundi</button>
            <button class:actif={debut === 7} onclick={() => (debut = 7)}>Dimanche</button>
          </div>
        </div>
      </div>
      <p class="muet">Le fuseau sert de référence aux échéances : « chaque lundi 19 h » reste 19 h après un changement d’heure.</p>
    </section>

    <section class="carte">
      <h3>Arrivée des nouveaux membres</h3>
      <label class="ligne-reglage">
        <input type="checkbox" bind:checked={ouvertes} />
        Inscriptions libres
        <span class="muet valeur">{ouvertes ? 'ouvertes' : 'fermées'}</span>
      </label>
      <p class="muet">
        {ouvertes
          ? 'Ouvertes : quiconque joint le serveur peut créer un compte, au statut des nouveaux membres.'
          : 'Fermées : on rejoint le foyer avec un code d’invitation, donné depuis Membres.'}
      </p>
      <label>
        Statut des nouveaux membres
        <select value={statuts.find((s) => s.isDefault)?.id ?? ''} disabled={envoi} onchange={(e) => statutParDefaut((e.currentTarget as HTMLSelectElement).value)}>
          {#each statuts as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
      </label>
      <div class="champ">
        <span>Durée d’une invitation</span>
        <div class="segment">
          {#each [[24, '1 jour'], [168, '7 jours'], [720, '30 jours']] as const as [h, libelle] (h)}
            <button class:actif={duree === h} onclick={() => (duree = h)}>{libelle}</button>
          {/each}
        </div>
      </div>
    </section>
  </div>

  <div class="pied">
    {#if message}<span class:erreur={message.erreur} class:ok={!message.erreur}>{message.texte}</span>{/if}
    <button class="primaire" disabled={envoi || !nom.trim()} onclick={enregistrer}>Enregistrer</button>
  </div>

  <div class="entete">
    <h2>Groupes de tâches</h2>
    <button onclick={() => (nouveauGroupe = true)}>+ Nouveau groupe</button>
  </div>
  <div class="tableau">
    {#each groupes as g, i (g.id)}
      <div class="rang">
          <span class="ordre">
            <button aria-label="Monter" disabled={i === 0 || envoi} onclick={() => deplacer(i, -1)}>↑</button>
            <button aria-label="Descendre" disabled={i === groupes.length - 1 || envoi} onclick={() => deplacer(i, 1)}>↓</button>
          </span>
          <PastilleGroupe color={g.color} icon={g.icon} taille={22} />
          <b class="nom">{g.name}</b>
          <span class="muet">{parGroupe.get(g.id) ?? 0} tâche{(parGroupe.get(g.id) ?? 0) > 1 ? 's' : ''}</span>
          <button class="lien" onclick={() => (edition = g)}>Modifier</button>
      </div>
    {:else}
      <p class="muet vide">Aucun groupe pour l’instant.</p>
    {/each}
  </div>

  <CopieAutomatique />
</div>

{#if nouveauGroupe}
  <NouveauGroupe onFermer={() => (nouveauGroupe = false)} onCree={() => ((nouveauGroupe = false), void charger())} />
{/if}

{#if edition}
  <NouveauGroupe
    groupe={edition}
    onFermer={() => (edition = null)}
    onCree={() => ((edition = null), void charger())}
    onSupprime={() => ((edition = null), void charger())}
  />
{/if}

<style>
  .cartes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  @media (max-width: 1000px) {
    .cartes {
      grid-template-columns: 1fr;
    }
  }

  .carte {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .carte p {
    margin: 0;
    font-size: 13px;
  }

  h2,
  h3 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  h2 {
    flex: 1;
  }

  label,
  .champ {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
    flex: 1;
  }

  .deux {
    display: flex;
    gap: 14px;
  }

  label.ligne-reglage {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--encre);
  }

  .ligne-reglage input {
    width: 20px;
    height: 20px;
    min-height: 0;
    accent-color: var(--accent);
  }

  .valeur {
    margin-left: auto;
    font-weight: 400;
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
    min-height: 40px;
  }

  .segment button + button {
    border-left: 1px solid var(--trait-net);
  }

  .segment button.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  .pied,
  .entete {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .entete {
    margin-top: 10px;
  }

  .ok {
    color: #15803d;
    font-size: 13px;
  }

  .erreur {
    color: #b91c1c;
    font-size: 13px;
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
    padding: 10px 18px;
    border-top: 1px solid var(--trait);
  }

  .rang:first-child {
    border-top: none;
  }

  .nom {
    flex: 1;
  }



  .ordre {
    display: flex;
    gap: 2px;
  }

  .ordre button {
    min-height: 26px;
    width: 26px;
    padding: 0;
    font-size: 13px;
  }




  button.lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }


  .vide {
    padding: 14px 18px;
  }
</style>
