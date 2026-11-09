<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { api } from '../../lib/session.svelte';

  /**
   * Administration › Serveur. Le serveur ne se met pas à jour lui-même :
   * un outil installé à côté (conteneur « maj » avec Docker, minuteur
   * systemd sinon) lit les réglages faits ici et s'en charge. Sans cet
   * outil, la page donne la commande à lancer.
   */
  interface Derniere {
    le?: string;
    de?: string;
    vers?: string;
    resultat?: 'reussie' | 'echouee' | 'differee';
    message?: string;
  }
  interface MisesAJour {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    checkedAt?: string | null;
    notesUrl: string | null;
    app: { version: string | null; publishedAt: string | null; downloadUrl?: string | null };
    auto: {
      politique: { automatique: boolean; heure: number; majeures: boolean; maintenant: string | null };
      outil: { present: boolean; actif: boolean; mode: 'docker' | 'classique' | null; vu: string | null; enCours: boolean; derniere: Derniere | null };
    };
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
  let envoi = $state(false);
  let message = $state<{ texte: string; erreur: boolean } | null>(null);

  const auto = $derived(maj?.auto);
  const demandeEnAttente = $derived(
    !!auto?.politique.maintenant && !auto.outil.enCours && (auto.outil.derniere?.le ?? '') < auto.politique.maintenant,
  );

  // Pendant une mise à jour, la page suit : l'outil passe toutes les cinq minutes.
  $effect(() => {
    if (!auto?.outil.enCours && !demandeEnAttente) return;
    const minuteur = setInterval(() => void recharger(), 10_000);
    return () => clearInterval(minuteur);
  });

  async function recharger() {
    try {
      maj = await api<MisesAJour>('/admin/updates');
    } catch {
      // Pendant le redémarrage, le serveur ne répond pas : on réessaie au prochain tour.
    }
  }

  async function regler(changement: Partial<{ automatique: boolean; heure: number; majeures: boolean }>) {
    envoi = true;
    message = null;
    try {
      maj = await api<MisesAJour>('/admin/updates/policy', { method: 'PATCH', body: JSON.stringify(changement) });
    } catch (e) {
      message = { texte: e instanceof ApiError ? e.message : 'Le serveur ne répond pas.', erreur: true };
    } finally {
      envoi = false;
    }
  }

  async function maintenant() {
    envoi = true;
    message = null;
    try {
      maj = await api<MisesAJour>('/admin/updates/now', { method: 'POST' });
      message = { texte: 'Demande envoyée : la mise à jour commence dans les cinq minutes.', erreur: false };
    } catch (e) {
      message = { texte: e instanceof ApiError ? e.message : 'Le serveur ne répond pas.', erreur: true };
    } finally {
      envoi = false;
    }
  }

  function ilYA(iso: string | null | undefined): string {
    if (!iso) return '';
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'à l’instant';
    if (minutes < 60) return `il y a ${minutes} min`;
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  const RESULTATS = { reussie: 'réussie', echouee: 'échouée', differee: 'en attente' } as const;

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
    {#if auto?.outil.actif}
      <div class="auto">
        <label class="bascule">
          <input type="checkbox" role="switch" checked={auto.politique.automatique} disabled={envoi} onchange={() => regler({ automatique: !auto.politique.automatique })} />
          <span>Installer seul les nouvelles versions, la nuit à</span>
          <select
            aria-label="Heure des mises à jour"
            value={auto.politique.heure}
            disabled={envoi || !auto.politique.automatique}
            onchange={(e) => regler({ heure: Number((e.currentTarget as HTMLSelectElement).value) })}
          >
            {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}<option value={h}>{h} h</option>{/each}
          </select>
        </label>
        <label class="bascule">
          <input type="checkbox" checked={auto.politique.majeures} disabled={envoi || !auto.politique.automatique} onchange={() => regler({ majeures: !auto.politique.majeures })} />
          <span>Versions majeures aussi <span class="muet">(sinon, elles attendent « Mettre à jour maintenant »)</span></span>
        </label>
        <p class="muet">
          Avant chaque mise à jour, la base est sauvegardée ; si la nouvelle version ne répond pas, l’ancienne revient.
          Outil de mise à jour : {auto.outil.mode === 'docker' ? 'conteneur Docker' : 'service système'}, vu {ilYA(auto.outil.vu)}.
        </p>
      </div>
      {#if auto.outil.enCours}
        <div class="encadre">Mise à jour en cours… le serveur redémarre, la page se rafraîchit seule.</div>
      {:else if demandeEnAttente}
        <div class="encadre">Mise à jour demandée : elle commence dans les cinq minutes.</div>
      {:else if maj?.updateAvailable}
        <button class="primaire bouton-maj" disabled={envoi} onclick={maintenant}>Mettre à jour maintenant vers {maj.latestVersion}</button>
      {/if}
      {#if auto.outil.derniere?.vers}
        {@const d = auto.outil.derniere}
        <p class="muet" class:mal={d.resultat === 'echouee'}>
          Dernière : {d.de} → {d.vers}, {RESULTATS[d.resultat ?? 'reussie']}{d.le ? `, ${ilYA(d.le)}` : ''}. {d.message ?? ''}
        </p>
      {/if}
    {:else if maj?.updateAvailable}
      <p class="muet">Pour l’installer, lancez sur la machine du serveur, dans le dossier de MyHousehold :</p>
      <div class="commande">
        <code>{COMMANDE}</code>
        <button aria-label="Copier la commande" onclick={copier}>{copie ? '✓' : '⧉'}</button>
      </div>
      <p class="muet">
        Aucun outil de mise à jour ne tourne à côté de ce serveur. L’installeur le met en place : les mises à jour se
        feront alors seules, la nuit, et se régleront ici.
      </p>
    {:else if maj}
      <p class="muet">Le serveur est à jour.</p>
    {/if}
    {#if maj?.updateAvailable && maj.notesUrl}<a class="bouton-lien" href={maj.notesUrl} target="_blank" rel="noopener noreferrer">Voir les nouveautés</a>{/if}
    {#if message}<p class:mal={message.erreur} class="petit">{message.texte}</p>{/if}
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

  .auto {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0 4px;
    border-top: 1px solid var(--trait);
  }

  .auto .bascule {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 400;
    color: var(--encre);
    flex-wrap: wrap;
  }

  .auto .bascule > span {
    flex: 1 1 0;
    min-width: 0;
  }

  .auto .bascule:first-child > span {
    flex: 0 1 auto;
  }

  .auto .bascule input {
    width: 18px;
    height: 18px;
    min-height: 0;
    accent-color: var(--accent);
  }

  .auto .bascule select {
    width: auto;
    flex: none;
    min-height: 32px;
    padding: 2px 8px;
  }

  .bouton-maj {
    align-self: flex-start;
  }
</style>
