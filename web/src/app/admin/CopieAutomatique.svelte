<script lang="ts">
  import { ApiError } from '../../lib/api';
  import { detecter, type Reglages, type RegleDeCopie } from '../../lib/detection';
  import { api, session } from '../../lib/session.svelte';

  /**
   * Administration › Réglages du foyer › Copie automatique : ce que les
   * détails des tâches reconnaissent. Une règle se pose sans formule — un
   * mot-clé, ou un format — et s'essaie avant d'être enregistrée.
   */
  let reglages = $state<Reglages>(structuredClone($state.snapshot(session.foyer?.detection) ?? {}));
  let edition = $state<RegleDeCopie | null>(null);
  let essai = $state('');
  let erreur = $state<string | null>(null);
  let envoi = $state(false);

  const regles = $derived(reglages.regles ?? []);
  const trouvees = $derived(
    edition && edition.motif.trim()
      ? detecter(essai, { telephones: false, adresses: false, liens: false, regles: [{ ...edition, active: true }] })
      : [],
  );

  async function enregistrer(changement: Reglages) {
    envoi = true;
    erreur = null;
    try {
      const foyer = await api<{ detection: Reglages }>('/household', {
        method: 'PATCH',
        body: JSON.stringify({ detection: changement }),
      });
      reglages = foyer.detection ?? {};
      if (session.foyer) session.foyer.detection = foyer.detection;
      return true;
    } catch (e) {
      erreur = e instanceof ApiError ? e.message : 'Le serveur ne répond pas.';
      return false;
    } finally {
      envoi = false;
    }
  }

  function nouvelle() {
    edition = { id: '', nom: '', type: 'MOT_CLE', motif: '', active: true };
    essai = '';
  }

  function identifiant(nom: string): string {
    const base =
      nom
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'regle';
    let id = base;
    for (let i = 2; regles.some((r) => r.id === id); i++) id = `${base}-${i}`;
    return id;
  }

  async function enregistrerRegle(e: SubmitEvent) {
    e.preventDefault();
    if (!edition) return;
    const regle = { ...edition, nom: edition.nom.trim(), motif: edition.motif.trim() };
    const liste = regle.id
      ? regles.map((r) => (r.id === regle.id ? regle : r))
      : [...regles, { ...regle, id: identifiant(regle.nom) }];
    if (await enregistrer({ regles: liste })) edition = null;
  }

  async function supprimer(id: string) {
    if (await enregistrer({ regles: regles.filter((r) => r.id !== id) })) edition = null;
  }

  function basculer(regle: RegleDeCopie) {
    void enregistrer({ regles: regles.map((r) => (r.id === regle.id ? { ...r, active: !r.active } : r)) });
  }
</script>

<section class="pile">
  <div class="entete">
    <h2>Copie automatique</h2>
    <button onclick={nouvelle} disabled={envoi}>+ Nouvelle règle</button>
  </div>
  <p class="muet">
    Dans les détails d’une tâche, ce qui correspond à une règle devient un bouton : un appui le copie. Les
    téléphones, les adresses et les liens se reconnaissent d’eux-mêmes.
  </p>
  {#if erreur}<div class="encadre alerte">{erreur}</div>{/if}

  <div class="colonnes">
    <div class="tableau" role="table" aria-label="Règles">
      {#each [['telephones', 'Téléphones', 'Appeler ou copier'], ['adresses', 'Adresses', 'Ouvrir dans la carte ou copier'], ['liens', 'Liens web', 'Ouvrir ou copier']] as const as [cle, nom, action] (cle)}
        <div class="rang" role="row">
          <label class="interrupteur">
            <input
              type="checkbox"
              checked={reglages[cle] !== false}
              disabled={envoi}
              onchange={(e) => enregistrer({ [cle]: (e.currentTarget as HTMLInputElement).checked })}
              aria-label={`Reconnaître les ${nom.toLowerCase()}`}
            />
            <span></span>
          </label>
          <b class="nom">{nom}</b>
          <span class="muet comment">{action}</span>
          <span class="muet">Intégrée</span>
        </div>
      {/each}
      {#each regles as r (r.id)}
        <div class="rang" role="row">
          <label class="interrupteur">
            <input type="checkbox" checked={r.active} disabled={envoi} onchange={() => basculer(r)} aria-label={`Activer ${r.nom}`} />
            <span></span>
          </label>
          <b class="nom">{r.nom}</b>
          <span class="comment">{r.type === 'MOT_CLE' ? `Après « ${r.motif} »` : 'Au format '}{#if r.type === 'FORMAT'}<code>{r.motif}</code>{/if}</span>
          <button class="lien" onclick={() => ((edition = { ...r }), (essai = ''))}>Modifier</button>
        </div>
      {/each}
    </div>

    {#if edition}
      <form class="carte pile formulaire" onsubmit={enregistrerRegle}>
        <h3>{edition.id ? 'Modifier la règle' : 'Nouvelle règle'}</h3>
        <label class="champ">Nom<input bind:value={edition.nom} required maxlength="60" placeholder="Code du portail" /></label>
        <div class="champ">
          <span>Comment la repérer</span>
          <div class="segment" role="group">
            <button type="button" class:actif={edition.type === 'MOT_CLE'} onclick={() => (edition!.type = 'MOT_CLE')}>Après un mot-clé</button>
            <button type="button" class:actif={edition.type === 'FORMAT'} onclick={() => (edition!.type = 'FORMAT')}>Un format</button>
          </div>
        </div>
        <label class="champ">
          {edition.type === 'MOT_CLE' ? 'Mot-clé' : 'Format'}
          <input
            bind:value={edition.motif}
            required
            maxlength="80"
            class:code={edition.type === 'FORMAT'}
            placeholder={edition.type === 'MOT_CLE' ? 'Code du portail' : 'CT-######'}
          />
          <span class="muet aide">
            {edition.type === 'MOT_CLE'
              ? 'Ce qui suit ce mot-clé, jusqu’à l’espace suivant, devient copiable.'
              : '# = un chiffre · A = une lettre · * = un chiffre ou une lettre · le reste tel quel'}
          </span>
        </label>
        <label class="champ">
          Essayer
          <textarea bind:value={essai} rows="3" placeholder="Collez un texte pour vérifier la règle"></textarea>
          {#if essai.trim()}
            <span class="muet aide">
              {trouvees.length === 0
                ? 'Rien trouvé.'
                : `${trouvees.length} trouvé${trouvees.length > 1 ? 's' : ''} : ${trouvees.map((t) => t.valeur).join(', ')}`}
            </span>
          {/if}
        </label>
        <div class="boutons">
          {#if edition.id}
            <button type="button" class="danger" disabled={envoi} onclick={() => supprimer(edition!.id)}>Supprimer</button>
          {/if}
          <span class="espace"></span>
          <button type="button" onclick={() => (edition = null)}>Annuler</button>
          <button type="submit" class="primaire" disabled={envoi || !edition.nom.trim() || !edition.motif.trim()}>Enregistrer</button>
        </div>
      </form>
    {/if}
  </div>
</section>

<style>
  .entete {
    display: flex;
    align-items: center;
  }

  .entete h2 {
    flex: 1;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
  }

  .colonnes {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  @media (max-width: 1000px) {
    .colonnes {
      grid-template-columns: 1fr;
    }
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
    padding: 12px 16px;
    border-top: 1px solid var(--trait);
    font-size: 14px;
  }

  .rang:first-child {
    border-top: none;
  }

  .nom {
    flex: 0 0 140px;
  }

  .comment {
    flex: 1;
  }

  code,
  input.code {
    font-family: ui-monospace, monospace;
  }

  .interrupteur {
    position: relative;
    flex: none;
    width: 40px;
    height: 22px;
  }

  .interrupteur input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    cursor: pointer;
  }

  .interrupteur span {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--trait-net);
    pointer-events: none;
  }

  .interrupteur span::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.15s;
  }

  .interrupteur input:checked + span {
    background: var(--accent);
  }

  .interrupteur input:checked + span::after {
    left: 21px;
  }

  .interrupteur input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .formulaire h3 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--gris);
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

  textarea {
    font: inherit;
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
    min-height: 38px;
  }

  .segment button + button {
    border-left: 1px solid var(--trait-net);
  }

  .segment button.actif {
    background: var(--accent-doux);
    color: var(--accent-sombre);
    font-weight: 600;
  }

  .boutons {
    display: flex;
    gap: 10px;
  }

  .espace {
    flex: 1;
  }

  .danger {
    color: #b91c1c;
  }

  button.lien {
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
  }
</style>
