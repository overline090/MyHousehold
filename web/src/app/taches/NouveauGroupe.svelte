<script lang="ts">
  import { ApiError } from '../../lib/api';
  import Icone from '../../lib/Icone.svelte';
  import ChoixCouleur from '../../lib/ChoixCouleur.svelte';
  import ChoixIcone from '../../lib/ChoixIcone.svelte';
  import { ecrireIcone, lireIcone, texteValide, type SorteDIcone } from '../../lib/icones';
  import PastilleGroupe from '../../lib/PastilleGroupe.svelte';
  import { api } from '../../lib/session.svelte';

  /**
   * Un groupe de tâches : un nom, une couleur et, si l'on veut, une icône,
   * pour s'y retrouver dans la liste. Sert à le créer comme à le modifier.
   */
  let {
    groupe = null,
    onFermer,
    onCree,
    onSupprime,
  }: {
    groupe?: { id: string; name: string; color: string; icon?: string | null } | null;
    onFermer: () => void;
    onCree: () => void;
    onSupprime?: () => void;
  } = $props();

  const COULEURS = ['#0F766E', '#65A30D', '#B45309', '#B91C1C', '#7C3AED', '#2563EB', '#DB2777', '#475569'];

  /* svelte-ignore state_referenced_locally */
  const depart = groupe;
  const lue = lireIcone(depart?.icon, 'maison');
  let nom = $state(depart?.name ?? '');
  let couleur = $state(depart?.color ?? COULEURS[0]);
  let sorte = $state<SorteDIcone>(lue.sorte);
  let icone = $state(lue.icone);
  let texte = $state(lue.texte);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  let confirmer = $state(false);

  const iconeFinale = $derived(ecrireIcone(sorte, icone, texte));
  const valide = $derived(!!nom.trim() && (sorte !== 'perso' || texteValide(texte.trim())));

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    envoi = true;
    try {
      await api(depart ? `/task-groups/${depart.id}` : '/task-groups', {
        method: depart ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: nom.trim(), color: couleur, icon: iconeFinale }),
      });
      onCree();
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
      await api(`/task-groups/${depart.id}`, { method: 'DELETE' });
      onSupprime?.();
    } catch (err) {
      erreur = err instanceof ApiError ? err.message : 'Le serveur ne répond pas.';
      envoi = false;
    }
  }
</script>

<button class="voile" aria-label="Fermer" onclick={onFermer}></button>
<form class="feuille" onsubmit={creer}>
  <div class="tete">
    <PastilleGroupe color={couleur} icon={iconeFinale} taille={36} />
    <h2>{depart ? 'Modifier le groupe' : 'Nouveau groupe'}</h2>
    <button type="button" class="fermer" aria-label="Fermer" onclick={onFermer}><Icone nom="fermer" taille={18} /></button>
  </div>
  <label>Nom<input bind:value={nom} required maxlength="60" placeholder="Cuisine, Jardin…" /></label>
  <div class="champ">
    <span>Couleur</span>
    <ChoixCouleur bind:valeur={couleur} couleurs={COULEURS} taille={30} />
  </div>
  <div class="champ">
    <span>Icône</span>
    <ChoixIcone bind:sorte bind:icone bind:texte />
  </div>
  {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}
  <div class="boutons">
    {#if depart && onSupprime}
      {#if confirmer}
        <button type="button" class="danger" disabled={envoi} onclick={supprimer} title="Les tâches du groupe restent, sans groupe">Supprimer pour de bon</button>
      {:else}
        <button type="button" class="danger" onclick={() => (confirmer = true)}>Supprimer</button>
      {/if}
      <span class="espace"></span>
    {/if}
    <button type="button" onclick={onFermer}>Annuler</button>
    <button type="submit" class="primaire" disabled={envoi || !valide}>{depart ? 'Enregistrer' : 'Créer'}</button>
  </div>
</form>

<style>
  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    border: none;
    border-radius: 0;
    background: rgba(16, 23, 21, 0.45);
  }

  .feuille {
    position: fixed;
    z-index: 21;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(400px, calc(100vw - 24px));
    background: var(--surface);
    border-radius: 18px;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 24px 60px rgba(16, 23, 21, 0.25);
  }

  .tete {
    display: flex;
    align-items: center;
  }

  .tete h2 {
    flex: 1;
    font-size: 18px;
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

  label,
  .champ {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .tete {
    gap: 10px;
  }

  .espace {
    flex: 1;
  }

  .danger {
    color: #b91c1c;
  }

  .boutons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
