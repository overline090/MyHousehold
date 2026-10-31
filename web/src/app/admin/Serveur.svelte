<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { api } from '../../lib/session.svelte';

  /**
   * Administration › Serveur. La mise à jour suit l'option prudente : le
   * serveur ne se met pas à jour lui-même, il dit quoi lancer.
   */
  interface MisesAJour {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    checkedAt?: string | null;
    notesUrl: string | null;
    app: { version: string | null; publishedAt: string | null; downloadUrl?: string | null };
  }
  interface Serveur {
    address: string;
    fingerprintDisplay: string;
    qrSvg: string;
    health: { database: string; redis: string; mdns: boolean; disk: { free: number; total: number } | null };
    phones: { expectedVersion: string | null; total: number; upToDate: number; behind: { name: string; version: string | null }[] };
  }

  const COMMANDE = 'docker compose pull && docker compose up -d';

  let maj = $state<MisesAJour | null>(null);
  let serveur = $state<Serveur | null>(null);
  let erreur = $state<string | null>(null);
  let copie = $state(false);

  $effect(() => {
    void (async () => {
      try {
        [maj, serveur] = await Promise.all([api<MisesAJour>('/admin/updates'), api<Serveur>('/admin/server')]);
      } catch (e) {
        erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
      }
    })();
  });

  async function copier() {
    await navigator.clipboard.writeText(COMMANDE).catch(() => {});
    copie = true;
    setTimeout(() => (copie = false), 2000);
  }

  function go(octets: number): string {
    return `${Math.round(octets / 1e9)} Go`;
  }
</script>

{#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

<div class="cartes">
  <section class="carte">
    <div class="titre">
      <h3>Mise à jour</h3>
      {#if maj?.updateAvailable}<span class="pastille">{maj.latestVersion} disponible</span>{/if}
    </div>
    <div class="ligne-info"><span>Version installée</span><span class="muet">{maj?.currentVersion ?? '…'}</span></div>
    {#if maj?.latestVersion}<div class="ligne-info"><span>Dernière version</span><span class="muet">{maj.latestVersion}</span></div>{/if}
    {#if maj?.updateAvailable}
      <p class="muet">Pour l’installer, lancez sur la machine du serveur, dans le dossier de MyHousehold :</p>
      <div class="commande">
        <code>{COMMANDE}</code>
        <button aria-label="Copier la commande" onclick={copier}>{copie ? '✓' : '⧉'}</button>
      </div>
      <p class="muet">Le serveur ne se met pas à jour lui-même : il faudrait lui confier toute la machine.</p>
      {#if maj.notesUrl}<a class="bouton-lien" href={maj.notesUrl} target="_blank" rel="noopener noreferrer">Voir les nouveautés</a>{/if}
    {:else if maj}
      <p class="muet">Le serveur est à jour.</p>
    {/if}
  </section>

  <section class="carte">
    <h3>Application des téléphones</h3>
    <div class="ligne-info"><span>Version proposée</span><span class="muet">{maj?.app.version ?? '—'}</span></div>
    {#if serveur?.phones.total}
      <div class="ligne-info"><span>Téléphones à jour</span><span class="muet">{serveur.phones.upToDate} sur {serveur.phones.total}</span></div>
    {/if}
    <p class="muet">
      Les téléphones lisent ici la version attendue par ce serveur, et se mettent à jour d’eux-mêmes.
      {#each serveur?.phones.behind ?? [] as t (t.name)}{t.name} est encore en {t.version}. {/each}
    </p>
    {#if maj?.app.downloadUrl}<a class="bouton-lien" href={maj.app.downloadUrl}>Télécharger l’APK</a>{/if}
  </section>

  <section class="carte">
    <h3>Connecter un téléphone</h3>
    {#if serveur}
      <div class="connexion">
        <div class="qr" aria-label="QR code du serveur">{@html serveur.qrSvg}</div>
        <div>
          <span class="muet petit">Adresse</span>
          <b>{serveur.address}</b>
          <span class="muet petit">Empreinte</span>
          <b class="empreinte">{serveur.fingerprintDisplay}</b>
        </div>
      </div>
      <p class="muet">Dans l’app : menu ☰ › Serveur, puis « Scanner le QR code du serveur ».</p>
    {/if}
  </section>

  <section class="carte">
    <h3>Santé</h3>
    {#if serveur}
      <div class="ligne-info"><span>Base de données</span><b class:mal={serveur.health.database !== 'up'}>{serveur.health.database === 'up' ? 'En marche' : 'Injoignable'}</b></div>
      <div class="ligne-info"><span>File de tâches</span><b class:mal={serveur.health.redis !== 'up'}>{serveur.health.redis === 'up' ? 'En marche' : 'Injoignable'}</b></div>
      <div class="ligne-info"><span>Annonce sur le Wi-Fi</span><b>{serveur.health.mdns ? 'Active' : 'Désactivée'}</b></div>
      {#if serveur.health.disk}
        <div class="ligne-info"><span>Espace disque</span><span class="muet">{go(serveur.health.disk.free)} libres sur {go(serveur.health.disk.total)}</span></div>
      {/if}
    {/if}
  </section>
</div>

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
    gap: 10px;
  }

  .carte p {
    margin: 0;
    font-size: 13px;
  }

  h3 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  .titre {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pastille {
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-sombre);
    background: var(--accent-doux);
    border-radius: 999px;
    padding: 3px 10px;
  }

  .ligne-info {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .mal {
    color: #b91c1c;
  }

  .commande {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #1c2624;
    color: #fff;
    border-radius: 12px;
    padding: 12px 14px;
  }

  .commande code {
    flex: 1;
    font-family: ui-monospace, monospace;
  }

  .commande button {
    background: transparent;
    color: #fff;
    border-color: rgba(255, 255, 255, 0.3);
    min-height: 32px;
    width: 32px;
    padding: 0;
  }

  .bouton-lien {
    align-self: flex-start;
    border: 1px solid var(--trait-net);
    border-radius: 999px;
    padding: 8px 16px;
    color: var(--encre);
    text-decoration: none;
    font-weight: 600;
  }

  .connexion {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .connexion > div:last-child {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .qr {
    width: 130px;
    flex: none;
    background: #fff;
    border-radius: 8px;
    padding: 4px;
  }

  .qr :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }

  .empreinte {
    font-size: 14px;
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
  }

  .petit {
    font-size: 12px;
  }
</style>
