<script lang="ts" module>
  /** Les icônes de l'interface, dessinées sur une grille de 24 : pas de police d'icônes à charger. */
  export const ICONES = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M6 9.5V20h12V9.5"/>',
    accueil: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/>',
    taches:
      '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    foyer:
      '<circle cx="9" cy="9" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 7a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5.2"/>',
    administration: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    preferences:
      '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    apropos: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    maj: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    appareils: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    cle: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    sortir: '<path d="M15 4h4v16h-4M10 12h10M6 8l-4 4 4 4"/>',
    crayon: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    poignee:
      '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
    coche: '<path d="m5 12 5 5 9-10"/>',
  } as const;
  export type NomIcone = keyof typeof ICONES;
</script>

<script lang="ts">
  let { nom, taille = 22 }: { nom: NomIcone; taille?: number } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  width={taille}
  height={taille}
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {@html ICONES[nom]}
</svg>

<style>
  svg {
    flex: none;
  }
</style>
