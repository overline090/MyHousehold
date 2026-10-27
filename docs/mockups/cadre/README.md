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
| `6-accueil-ordi.html` | **Accueil**, ordinateur : ce que je dois faire à gauche, la semaine à droite |
| `7-accueil-mobile.html` | **Accueil**, téléphone : le même que dans l'app |
| `8-accueil-tuiles.html` | **Accueil en tuiles** : chaque section est une tuile, de taille S, M, L ou XL |
| `9-accueil-personnaliser.html` | Personnaliser l'accueil : déplacer, redimensionner, retirer, ajouter une tuile |
| `10-administration.html` | **Administration**, page dédiée avec sa navigation secondaire — ici, les membres |

## Ce que ce cadre décide

- **La même navigation que l'app** : Accueil, Tâches, Agenda, Foyer, puis
  **Administration** — une seule entrée, qui ouvre une page dédiée avec sa propre
  navigation (Membres, Statuts et droits, Réglages du foyer, Serveur, Activité). Elle
  n'apparaît qu'aux comptes qui ont au moins un de ces droits, et chaque rubrique
  seulement à qui en a le droit — absente, pas grisée.
- **L'accueil est fait de tuiles**, que chacun dispose à sa façon : l'ordre, la
  taille et les tuiles affichées appartiennent au compte, pas au foyer.
- **Repliable** sur ordinateur ; le choix est retenu d'une visite à l'autre.
- **La barre d'outils est au-dessus de tout**, sur toute la largeur : le bouton ☰
  qui replie la navigation, le foyer, puis Ajouter, la mise à jour du serveur quand
  il y en a une (administrateurs) et la photo qui ouvre le menu du compte. La
  navigation et la page sont dessous ; le titre de la page ouvre la page, sans
  sous-titre.
- **Sur téléphone, la page se comporte comme l'app**, pour qu'on n'ait pas deux
  façons de faire la même chose.
