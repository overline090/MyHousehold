<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { api, monAppareil } from '../../lib/session.svelte';

  /** Où mon compte est connecté, et déconnecter un appareil perdu ou prêté. */
  interface Appareil {
    id: string;
    name: string | null;
    appVersion: string | null;
    lastSeenAt: string;
  }

  const ici = monAppareil();
  let appareils = $state<Appareil[] | null>(null);
  let erreur = $state<string | null>(null);

  async function charger() {
    try {
      appareils = await api<Appareil[]>('/users/me/devices');
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
    }
  }

  $effect(() => {
    void charger();
  });

  async function deconnecter(id: string) {
    await api(`/users/me/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    await charger();
  }

  async function deconnecterLesAutres() {
    await api('/users/me/devices/disconnect-others', { method: 'POST', body: JSON.stringify({ deviceId: ici }) }).catch(() => {});
    await charger();
  }

  function ilYA(iso: string): string {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 2) return 'Maintenant';
    if (minutes < 60) return `Il y a ${minutes} minutes`;
    const heures = Math.round(minutes / 60);
    if (heures < 24) return `Il y a ${heures} heure${heures > 1 ? 's' : ''}`;
    const jours = Math.round(heures / 24);
    if (jours === 1) return 'Hier';
    if (jours < 14) return `Il y a ${jours} jours`;
    return `Il y a ${Math.round(jours / 7)} semaines`;
  }

  function telephone(a: Appareil): boolean {
    return !!a.appVersion || /android|pixel|samsung|téléphone|phone/i.test(a.name ?? '');
  }
</script>

{#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

<div class="tableau" role="table" aria-label="Mes appareils">
  <div class="rang titres" role="row"><span class="c-nom">Appareil</span><span class="c-vu">Dernière activité</span><span class="c-act"></span></div>
  {#each appareils ?? [] as a (a.id)}
    <div class="rang" role="row">
      <span class="c-nom">
        <span class="icone" aria-hidden="true">{telephone(a) ? '▯' : '▭'}</span>
        <span>
          <b>{a.id === ici ? 'Ce navigateur' : (a.name ?? (a.id === 'inconnu' ? 'Sessions sans nom d’appareil' : 'Appareil'))}</b>
          <span class="muet">{a.id === ici ? (a.name ?? '') : a.appVersion ? `App ${a.appVersion}` : ''}</span>
        </span>
      </span>
      <span class="c-vu muet">{a.id === ici ? 'Maintenant' : ilYA(a.lastSeenAt)}</span>
      <span class="c-act">
        {#if a.id === ici}<span class="muet">Cet appareil</span>{:else}<button class="lien" onclick={() => deconnecter(a.id)}>Déconnecter</button>{/if}
      </span>
    </div>
  {:else}
    <p class="muet vide">{appareils ? 'Aucun appareil connecté.' : 'Chargement…'}</p>
  {/each}
</div>

<div class="bas">
  <p class="muet">Un appareil perdu ou prêté se déconnecte d’ici : il devra se reconnecter avec votre identifiant et votre mot de passe.</p>
  <button onclick={deconnecterLesAutres} disabled={!appareils || appareils.every((a) => a.id === ici)}>Déconnecter tous les autres</button>
</div>

<style>
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
    padding: 12px 18px;
    border-top: 1px solid var(--trait);
  }

  .rang.titres {
    border-top: none;
    background: var(--surface-douce);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  .c-nom {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .c-nom > span:last-child {
    display: flex;
    flex-direction: column;
  }

  .c-vu {
    flex: 0 0 200px;
  }

  .c-act {
    flex: 0 0 130px;
    text-align: right;
  }

  .icone {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--surface-douce);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gris);
  }

  .vide {
    padding: 16px 18px;
  }

  .bas {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 16px;
  }

  .bas p {
    flex: 1;
    margin: 0;
  }

  button.lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: #b91c1c;
    font-weight: 600;
  }
</style>
