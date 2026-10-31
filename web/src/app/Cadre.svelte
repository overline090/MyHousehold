<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone, { type NomIcone } from '../lib/Icone.svelte';
  import { barre } from '../lib/barre.svelte';
  import { enregistrerPreferences, preferences } from '../lib/preferences.svelte';
  import { aller, route } from '../lib/route.svelte';
  import { aLeDroit, api, seDeconnecter, session } from '../lib/session.svelte';
  import AjoutRapide from './AjoutRapide.svelte';
  import Photo from './Photo.svelte';

  let { children }: { children: Snippet } = $props();

  interface Entree {
    chemin: string;
    libelle: string;
    icone: NomIcone;
  }

  const PRINCIPALES: Entree[] = [
    { chemin: '/', libelle: 'Accueil', icone: 'accueil' },
    { chemin: '/taches', libelle: 'Tâches', icone: 'taches' },
    { chemin: '/agenda', libelle: 'Agenda', icone: 'agenda' },
    { chemin: '/foyer', libelle: 'Foyer', icone: 'foyer' },
  ];
  const BAS: Entree[] = [
    { chemin: '/preferences', libelle: 'Préférences', icone: 'preferences' },
    { chemin: '/a-propos', libelle: 'À propos', icone: 'apropos' },
  ];

  /** L'administration n'apparaît qu'à qui a au moins un de ses droits : absente, pas grisée. */
  const administration = $derived(
    ['MANAGE_MEMBERS', 'MANAGE_STATUSES', 'MANAGE_SERVER'].some((d) => aLeDroit(d)),
  );
  const peutAjouter = $derived(aLeDroit('MANAGE_TASKS') || aLeDroit('MANAGE_APPOINTMENTS'));

  // Sur téléphone, la page se comporte comme l'app : barre du bas, bouton +, menu ☰.
  const requete = window.matchMedia('(max-width: 760px)');
  let telephone = $state(requete.matches);
  requete.addEventListener('change', (e) => (telephone = e.matches));

  let voletOuvert = $state(false);
  let menuCompte = $state(false);
  let ajout = $state(false);
  let majServeur = $state(false);

  // Le choix replié/déplié suit le compte ; localStorage évite seulement
  // que le menu saute à l'ouverture, avant que les préférences arrivent.
  let repliee = $state(lireRepliee());
  $effect(() => {
    if (preferences.chargees && preferences.valeurs.navigationRepliee !== undefined) {
      repliee = preferences.valeurs.navigationRepliee;
    }
  });

  function lireRepliee(): boolean {
    try {
      return window.localStorage.getItem('mh-navigation-repliee') === '1';
    } catch {
      return false;
    }
  }

  function basculerNavigation() {
    if (telephone) {
      voletOuvert = !voletOuvert;
      return;
    }
    repliee = !repliee;
    try {
      window.localStorage.setItem('mh-navigation-repliee', repliee ? '1' : '0');
    } catch {
      // Navigation privée : le choix vaudra pour cette visite seulement.
    }
    void enregistrerPreferences({ navigationRepliee: repliee }).catch(() => {});
  }

  function estActive(chemin: string): boolean {
    return chemin === '/' ? route.chemin === '/' : route.chemin.startsWith(chemin);
  }

  function ouvrir(chemin: string) {
    voletOuvert = false;
    menuCompte = false;
    aller(chemin);
  }

  // La mise à jour du serveur n'intéresse que ceux qui l'administrent.
  $effect(() => {
    if (!aLeDroit('MANAGE_SERVER')) return;
    api<{ updateAvailable?: boolean }>('/admin/updates')
      .then((etat) => (majServeur = Boolean(etat.updateAvailable)))
      .catch(() => {});
  });
</script>

{#snippet navigation(classe: string)}
  <nav class="nav {classe}" aria-label="Navigation principale">
    {#each PRINCIPALES as entree (entree.chemin)}
      {@render lien(entree)}
    {/each}
    {#if administration}
      {@render lien({ chemin: '/administration', libelle: 'Administration', icone: 'administration' }, majServeur)}
    {/if}
    <div class="bas">
      {#each BAS as entree (entree.chemin)}
        {@render lien(entree)}
      {/each}
    </div>
  </nav>
{/snippet}

{#snippet lien(entree: Entree, signal = false)}
  <a
    href={entree.chemin}
    class:actif={estActive(entree.chemin)}
    class:signal
    title={repliee && !telephone ? entree.libelle : undefined}
    onclick={(e) => {
      e.preventDefault();
      ouvrir(entree.chemin);
    }}
  >
    <Icone nom={entree.icone} />
    <span class="libelle">{entree.libelle}</span>
    {#if signal}<span class="pastille">1</span>{/if}
  </a>
{/snippet}

<div class="cadre">
  <header class="barre">
    <button
      class="icone"
      aria-label={telephone ? 'Ouvrir le menu' : repliee ? 'Déplier le menu' : 'Replier le menu'}
      onclick={basculerNavigation}
    >
      <Icone nom="menu" />
    </button>
    <a
      class="marque"
      href="/"
      onclick={(e) => {
        e.preventDefault();
        ouvrir('/');
      }}
    >
      <span class="logo"><Icone nom="maison" taille={18} /></span>
      <b>{session.foyer?.name ?? 'MyHousehold'}</b>
    </a>

    {#if barre.actions && !telephone}
      <div class="actions">{@render barre.actions()}</div>
    {/if}
    {#if peutAjouter && !telephone}
      <button class="primaire ajouter" onclick={() => (ajout = true)}>
        <Icone nom="plus" taille={18} />Ajouter
      </button>
    {/if}
    {#if majServeur}
      <button
        class="icone point"
        title="Une mise à jour du serveur est disponible"
        aria-label="Mise à jour du serveur disponible"
        onclick={() => ouvrir('/administration/serveur')}
      >
        <Icone nom="maj" />
      </button>
    {/if}
    <button class="icone compte" aria-label="Mon compte" onclick={() => (menuCompte = !menuCompte)}>
      {#if session.utilisateur}<Photo membre={session.utilisateur} taille={34} />{/if}
    </button>
  </header>

  <div class="dessous">
    {#if !telephone}
      {@render navigation(repliee ? 'repliee' : '')}
    {/if}
    <main class="page">{@render children()}</main>
  </div>

  {#if telephone}
    {#if peutAjouter}
      <button class="fab" aria-label="Ajouter" onclick={() => (ajout = true)}><Icone nom="plus" taille={28} /></button>
    {/if}
    <nav class="onglets" aria-label="Onglets">
      {#each PRINCIPALES.slice(0, 3) as entree (entree.chemin)}
        <a
          href={entree.chemin}
          class:actif={estActive(entree.chemin)}
          onclick={(e) => {
            e.preventDefault();
            ouvrir(entree.chemin);
          }}><Icone nom={entree.icone} />{entree.libelle}</a
        >
      {/each}
    </nav>
    {#if voletOuvert}
      <button class="voile" aria-label="Fermer le menu" onclick={() => (voletOuvert = false)}></button>
      <div class="volet">{@render navigation('')}</div>
    {/if}
  {/if}

  {#if menuCompte && session.utilisateur}
    <button class="voile transparent" aria-label="Fermer" onclick={() => (menuCompte = false)}></button>
    <div class="menu" role="menu">
      <div class="qui">
        <Photo membre={session.utilisateur} taille={42} />
        <div>
          <b>{session.utilisateur.firstName} {session.utilisateur.lastName}</b>
          <div class="muet">{session.utilisateur.username} · {session.utilisateur.status.name}</div>
        </div>
      </div>
      <button role="menuitem" onclick={() => ouvrir('/profil')}><Icone nom="profil" taille={20} />Mon profil</button>
      <button role="menuitem" onclick={() => ouvrir('/appareils')}><Icone nom="appareils" taille={20} />Mes appareils</button>
      <button role="menuitem" onclick={() => ouvrir('/profil')}><Icone nom="cle" taille={20} />Changer mon mot de passe</button>
      <button
        role="menuitem"
        class="danger"
        onclick={() => {
          menuCompte = false;
          void seDeconnecter();
        }}><Icone nom="sortir" taille={20} />Se déconnecter</button
      >
    </div>
  {/if}

  {#if ajout}
    <AjoutRapide onFermer={() => (ajout = false)} />
  {/if}
</div>

<style>
  .cadre {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .barre {
    position: sticky;
    top: 0;
    z-index: 5;
    height: 60px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px 0 10px;
    background: var(--surface);
    border-bottom: 1px solid var(--trait);
  }

  .marque {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    color: var(--encre);
    text-decoration: none;
  }

  .marque b {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .logo {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions :global(button) {
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  button.icone {
    min-height: 40px;
    width: 40px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--encre-douce);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  button.icone:hover {
    background: var(--surface-douce);
  }

  button.icone.point::after {
    content: '';
    position: absolute;
    top: 8px;
    right: 8px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--surface);
  }

  button.compte {
    width: 44px;
  }

  .ajouter {
    min-height: 38px;
    padding: 0 16px 0 12px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .dessous {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .page {
    flex: 1;
    min-width: 0;
    padding: 20px 26px 40px;
  }

  .nav {
    position: sticky;
    top: 60px;
    align-self: flex-start;
    height: calc(100vh - 60px);
    flex: none;
    width: 248px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 12px;
    background: var(--surface);
    border-right: 1px solid var(--trait);
  }

  .nav a {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--encre-douce);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    position: relative;
  }

  .nav a:hover {
    background: var(--surface-douce);
  }

  .nav a.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  .pastille {
    margin-left: auto;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: var(--accent);
    border-radius: 999px;
    padding: 1px 7px;
  }

  .nav .bas {
    margin-top: auto;
    border-top: 1px solid var(--trait);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav.repliee {
    width: 68px;
    padding: 14px 10px;
  }

  .nav.repliee .libelle,
  .nav.repliee .pastille {
    display: none;
  }

  .nav.repliee a {
    justify-content: center;
    padding: 0;
    width: 48px;
  }

  .nav.repliee a.signal::after {
    content: '';
    position: absolute;
    top: 9px;
    right: 11px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--surface);
  }

  .voile {
    position: fixed;
    inset: 60px 0 0 0;
    z-index: 6;
    border: none;
    border-radius: 0;
    background: rgba(16, 23, 21, 0.45);
  }

  .voile.transparent {
    inset: 0;
    background: transparent;
  }

  .volet {
    position: fixed;
    top: 60px;
    bottom: 0;
    left: 0;
    z-index: 7;
  }

  .volet :global(.nav) {
    position: static;
    height: 100%;
    width: 290px;
    border-radius: 0 18px 0 0;
  }

  .menu {
    position: fixed;
    top: 56px;
    right: 14px;
    z-index: 8;
    width: 280px;
    background: var(--surface);
    border: 1px solid var(--trait);
    border-radius: 14px;
    box-shadow: 0 12px 32px rgba(16, 23, 21, 0.14);
    padding: 8px;
    display: flex;
    flex-direction: column;
  }

  .menu .qui {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 10px 14px;
    border-bottom: 1px solid var(--trait);
    margin-bottom: 6px;
    font-size: 14px;
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 12px;
    border: none;
    background: transparent;
    min-height: 40px;
    padding: 0 10px;
    border-radius: 10px;
    color: var(--encre-douce);
    text-align: left;
    font-size: 14px;
  }

  .menu button:hover {
    background: var(--surface-douce);
  }

  .menu button.danger {
    color: #b91c1c;
  }

  .onglets {
    position: sticky;
    bottom: 0;
    z-index: 4;
    display: flex;
    background: var(--surface);
    border-top: 1px solid var(--trait);
    padding: 8px 4px 12px;
  }

  .onglets a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--gris);
    text-decoration: none;
  }

  .onglets a.actif {
    color: var(--accent);
    font-weight: 600;
  }

  .fab {
    position: fixed;
    right: 18px;
    bottom: 82px;
    z-index: 4;
    width: 58px;
    height: 58px;
    padding: 0;
    border: none;
    border-radius: 18px;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 16px rgba(15, 118, 110, 0.35);
  }

  @media (max-width: 760px) {
    .page {
      padding: 14px 14px 90px;
    }
  }
</style>
