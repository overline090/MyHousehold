<script lang="ts">
  import { enregistrerPreferences, preferences } from '../../lib/preferences.svelte';

  /** Mes préférences : elles suivent mon compte, et ne changent rien pour les autres. */
  const apparence = $derived(preferences.valeurs.apparence ?? 'auto');
  const ouverture = $derived(preferences.valeurs.pageOuverture ?? 'accueil');
  let message = $state<string | null>(null);

  async function changer(changement: Parameters<typeof enregistrerPreferences>[0], texte = 'Enregistré.') {
    await enregistrerPreferences(changement).catch(() => {});
    message = texte;
  }
</script>

<div class="grille">
  <section class="carte">
    <h3>Apparence</h3>
    <div class="segment" role="group" aria-label="Apparence">
      {#each [['auto', 'Automatique'], ['clair', 'Clair'], ['sombre', 'Sombre']] as const as [v, libelle] (v)}
        <button class:actif={apparence === v} onclick={() => changer({ apparence: v })}>{libelle}</button>
      {/each}
    </div>
    <p class="muet">Automatique suit le réglage de l’ordinateur.</p>
  </section>

  <section class="carte">
    <h3>Navigation</h3>
    <label class="interrupteur-ligne">
      <input
        type="checkbox"
        checked={preferences.valeurs.navigationRepliee ?? false}
        onchange={(e) => changer({ navigationRepliee: (e.currentTarget as HTMLInputElement).checked })}
      />
      Menu replié à l’ouverture
    </label>
    <span class="etiquette">Page à l’ouverture</span>
    <div class="segment" role="group" aria-label="Page à l’ouverture">
      {#each [['accueil', 'Accueil'], ['taches', 'Tâches'], ['agenda', 'Agenda']] as const as [v, libelle] (v)}
        <button class:actif={ouverture === v} onclick={() => changer({ pageOuverture: v })}>{libelle}</button>
      {/each}
    </div>
  </section>

  <section class="carte">
    <h3>Accueil</h3>
    <p class="muet">Vos tuiles, leur ordre et leur taille vous appartiennent.</p>
    <button class="gauche" onclick={() => changer({ accueil: null }, 'L’accueil est rétabli.')}>Rétablir l’accueil par défaut</button>
  </section>

  <section class="carte">
    <h3>Langue et dates</h3>
    <div class="ligne-info"><span>Langue</span><span class="muet">Français</span></div>
    <div class="ligne-info"><span>Heures</span><span class="muet">24 h</span></div>
  </section>
</div>

<p class="muet">
  Ces préférences sont les vôtres et suivent votre compte : elles ne changent rien pour les autres membres.
  {#if message}<b class="ok">{message}</b>{/if}
</p>

<style>
  .grille {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    margin-bottom: 16px;
  }

  @media (max-width: 900px) {
    .grille {
      grid-template-columns: 1fr;
    }
  }

  .carte {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
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

  .interrupteur-ligne {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .interrupteur-ligne input {
    width: auto;
    min-height: 0;
  }

  .etiquette {
    font-size: 13px;
    font-weight: 600;
    color: var(--encre-douce);
  }

  .gauche {
    align-self: flex-start;
  }

  .ligne-info {
    display: flex;
    justify-content: space-between;
  }

  .ok {
    color: #15803d;
    margin-left: 8px;
  }
</style>
