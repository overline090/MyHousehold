<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { plugins, chargerPlugins, type Plugin } from '../../lib/plugins.svelte';
  import { api } from '../../lib/session.svelte';

  /**
   * Administration › Plugins : ceux livrés avec MyHousehold, qu'on active
   * ou non pour le foyer. Désactiver ne supprime rien : les données
   * reviennent à la réactivation.
   */
  let filtre = $state<'tous' | 'actifs' | 'inactifs'>('tous');
  let message = $state<{ texte: string; erreur: boolean } | null>(null);
  let envoi = $state<string | null>(null);

  $effect(() => {
    void chargerPlugins().catch((e) => {
      message = { texte: e instanceof ApiError ? e.message : 'Le serveur ne répond pas.', erreur: true };
    });
  });

  const visibles = $derived(
    plugins.liste.filter((p) => (filtre === 'tous' ? true : filtre === 'actifs' ? p.enabled : !p.enabled)),
  );

  async function basculer(p: Plugin) {
    envoi = p.id;
    try {
      await api(`/plugins/${p.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !p.enabled }) });
      await chargerPlugins();
      message = {
        texte: p.enabled ? `« ${p.nom} » désactivé ; ses données sont gardées.` : `« ${p.nom} » activé pour tout le foyer.`,
        erreur: false,
      };
    } catch (e) {
      message = { texte: e instanceof ApiError ? e.message : 'Le serveur ne répond pas.', erreur: true };
    } finally {
      envoi = null;
    }
  }
</script>

<div class="pile">
  <div class="entete">
    <div class="filtres">
      <button class:actif={filtre === 'tous'} onclick={() => (filtre = 'tous')}>Tous · {plugins.liste.length}</button>
      <button class:actif={filtre === 'actifs'} onclick={() => (filtre = 'actifs')}>Activés · {plugins.liste.filter((p) => p.enabled).length}</button>
      <button class:actif={filtre === 'inactifs'} onclick={() => (filtre = 'inactifs')}>Désactivés · {plugins.liste.filter((p) => !p.enabled).length}</button>
    </div>
    {#if message}<span class:erreur={message.erreur} class:ok={!message.erreur}>{message.texte}</span>{/if}
  </div>

  <div class="grille">
    {#each visibles as p (p.id)}
      <section class="carte" class:eteinte={!p.disponible} aria-label={p.nom}>
        <div class="haut">
          <h3>{p.nom}</h3>
          {#if p.disponible}
            <label class="bascule">
              <input type="checkbox" role="switch" checked={p.enabled} disabled={envoi === p.id} onchange={() => basculer(p)} aria-label={`Activer ${p.nom}`} />
              <span class="muet">{p.enabled ? 'Activé' : 'Désactivé'}</span>
            </label>
          {:else}
            <span class="badge">En préparation</span>
          {/if}
        </div>
        <p>{p.description}</p>
        <div class="apports">
          {#each p.apporte as a (a)}<span>{a}</span>{/each}
        </div>
      </section>
    {/each}
  </div>

  <p class="muet petit">
    Seuls les plugins livrés avec MyHousehold existent : rien ne s’installe depuis ailleurs. Un plugin activé l’est pour
    tout le foyer, sur le web comme dans l’application.
  </p>
</div>

<style>
  .pile {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .entete {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .filtres {
    flex: 1;
    display: flex;
    gap: 6px;
  }

  .filtres button {
    min-height: 36px;
    border-radius: 999px;
    padding: 0 14px;
  }

  .filtres button.actif {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .carte {
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .carte.eteinte {
    background: var(--surface-douce);
  }

  .carte.eteinte h3,
  .carte.eteinte p {
    color: var(--gris);
  }

  .haut {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h3 {
    flex: 1;
    font-size: 16px;
  }

  .carte p {
    margin: 0;
    font-size: 14px;
  }

  .bascule {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .bascule input {
    width: 20px;
    height: 20px;
    min-height: 0;
    accent-color: var(--accent);
  }

  .badge {
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--trait);
    color: var(--gris);
  }

  .apports {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .apports span {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--accent-doux);
    color: var(--accent-sombre);
  }

  .ok {
    color: #15803d;
    font-size: 13px;
  }

  .erreur {
    color: #b91c1c;
    font-size: 13px;
  }

  .petit {
    font-size: 13px;
    margin: 0;
  }
</style>
