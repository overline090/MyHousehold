# Le cadre de l'interface web

Ce qui entoure chaque écran, une fois connecté : la barre d'outils et la navigation
latérale. Les écrans eux-mêmes viendront un par un, dans la zone en pointillé.

```bash
node docs/mockups/cadre/rendre.js   # 1280 × 800 pour l'ordinateur, 390 × 844 pour le téléphone
```

| Fichier | Écran |
|---|---|
| `1-ordi-deplie.html` | Ordinateur, navigation dépliée |
| `2-ordi-replie.html` | Ordinateur, navigation repliée sur ses icônes (le nom au survol) |
| `3-ordi-menu-compte.html` | Le menu du compte, ouvert depuis la photo |
| `4-mobile.html` | Téléphone : comme l'app — barre du bas, bouton d'ajout, menu ☰ |
| `5-mobile-volet.html` | Téléphone, menu ouvert |

## Ce que ce cadre décide

- **La même navigation que l'app**, à plat : Accueil, Tâches, Agenda, Foyer, puis
  l'**Administration**, qui n'apparaît qu'aux comptes qui en ont le droit — absente,
  pas grisée.
- **Repliable** sur ordinateur ; le choix est retenu d'une visite à l'autre.
- **La barre d'outils** : replier, le titre de la page (sans sous-titre), Ajouter,
  la mise à jour du serveur quand il y en a une (administrateurs), la photo qui ouvre
  le menu du compte.
- **Sur téléphone, la page se comporte comme l'app**, pour qu'on n'ait pas deux
  façons de faire la même chose.
