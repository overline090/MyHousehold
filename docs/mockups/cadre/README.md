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
| `11-plugins.html` | **Plugins** : les fonctionnalités supplémentaires du foyer, activables une à une |
| `12-stock.html` | Plugin **Gestion de stock** : les tableaux, et les articles du tableau choisi |
| `13-stock-article.html` | La fiche d'un article : image, nom, quantité et minimum, péremption, lien, détail |
| `14-stock-tableau.html` | Nouveau tableau : son nom et son image |
| `15-stock-sortie.html` | Déclarer une sortie : cocher un ou plusieurs articles, et combien sortent |
| `16-taches.html` | **Tâches** : toutes les tâches, rangées par groupe, avec leur règle en clair |
| `17-tache.html` | La fiche d'une tâche, en panneau : type, répétition, trois prochaines fois, groupe, priorité, qui |
| `18-agenda.html` | **Agenda** : le mois en grand, et le jour choisi à droite |
| `19-foyer.html` | **Foyer** : les membres, ce qui a été fait par groupe, les réglages en lecture |
| `20-admin-statuts.html` | Administration › **Statuts et droits** : la matrice droits × statuts |
| `21-admin-reglages.html` | Administration › **Réglages du foyer** : nom, fuseau, semaine, invitations, groupes |
| `22-admin-serveur.html` | Administration › **Serveur** : mise à jour, version d'app, connecter un téléphone, santé |
| `23-admin-activite.html` | Administration › **Activité** : le journal du foyer, filtrable |
| `24-admin-statut-modifier.html` | Modifier un statut : nom, couleur, droits, qui le porte |
| `25-profil.html` | **Mon profil** : photo, identité, mot de passe, agenda personnel, supprimer mon compte |
| `26-appareils.html` | **Mes appareils** : où mon compte est connecté, et déconnecter un appareil |
| `27-preferences.html` | **Préférences** : apparence, navigation, accueil, langue — les miennes seulement |
| `28-admin-membre.html` | Gérer un membre : statut, code de mot de passe oublié, appareils, suppression du compte |
| `29-connexion.html` | La page de connexion : identifiant et mot de passe |
| `30-mot-de-passe-oublie.html` | Mot de passe oublié : le code donné par un administrateur, et le nouveau mot de passe |
| `31-accueil-redimensionner.html` | Redimensionner une tuile à la main : aimantée sur des longueurs entières et sur le bord des tuiles voisines |
| `32-tache-tous-les-n-jours.html` | Une tâche « tous les N jours », et le premier jour de la série |
| `33-accueil-echanger.html` | Échanger deux tuiles : lâchée sur une autre, elles échangent leur place |
| `34-tache-details.html` | Les détails d’une tâche : texte mis en forme (gras, italique, souligné, barré, couleur, surligneur, listes, cases) |
| `35-tache-details-lire.html` | Les lire : un appui sur un numéro (appeler, copier), une adresse (carte, copier), un code (copié) |
| `36-admin-copie-automatique.html` | Administration › Réglages du foyer › **Copie automatique** : les règles du foyer, et les essayer |
| `37-tache-valider.html` | Une tâche ouverte : son état, « C’est fait » ou « Passer cette fois », les dernières fois et par qui |
| `40-stock-groupes.html` | Le stock rangé par groupe (Pharmacie › Groupe A, Groupe B), « Retirer » sur chaque ligne |
| `41-stock-retrait.html` | « Retirer » : combien, et une note facultative |
| `38-ajouter-dans-la-page.html` | Le « + » d'ajout en tête de chaque page, à côté de son titre |

## Ce que ce cadre décide

- **La même navigation que l'app** : Accueil, Tâches, Agenda, Foyer, puis
  **Administration** — une seule entrée, qui ouvre une page dédiée avec sa propre
  navigation (Membres, Statuts et droits, Réglages du foyer, Serveur, Activité). Elle
  n'apparaît qu'aux comptes qui ont au moins un de ces droits, et chaque rubrique
  seulement à qui en a le droit — absente, pas grisée.
- **L'accueil est fait de tuiles**, que chacun dispose à sa façon : l'ordre, la
  taille et les tuiles affichées appartiennent au compte, pas au foyer. Ses boutons
  (Personnaliser, puis Rétablir et Terminé, et Ajouter) sont en tête de la page.
- **Repliable** sur ordinateur ; le choix est retenu d'une visite à l'autre.
- **La barre d'outils est au-dessus de tout**, sur toute la largeur : le bouton ☰
  qui replie la navigation, le foyer, la mise à jour du serveur quand il y en a une
  (administrateurs) et la photo qui ouvre le menu du compte. La navigation et la page
  sont dessous.
- **Ajouter, c'est un « + » dans la page** (maquette `38-ajouter-dans-la-page.html`) :
  jamais dans la barre d'outils, un seul par page, en tête de la page à côté de son
  titre, sans texte — son nom (« Nouvelle tâche », « Nouveau rendez-vous »…) n'est que
  dans l'info-bulle. Sur l'accueil, il ouvre l'ajout rapide (tâche ou rendez-vous).
  Pas de bouton flottant sur téléphone : le même « + », en tête de la page.
- **Sur téléphone, la page se comporte comme l'app**, pour qu'on n'ait pas deux
  façons de faire la même chose.

- **Les plugins** ajoutent une fonctionnalité au foyer entier, activable ou non par
  un administrateur. Chacun dit ce qu'il apporte (une page, une tuile d'accueil, un
  réglage du profil, des entrées d'agenda) ; désactivé, il disparaît des pages et
  des téléphones, et ce qu'il a enregistré est gardé pour le jour où on le réactive.
- **Seuls les plugins livrés avec MyHousehold** sont proposés, et seuls les comptes
  qui administrent le serveur les activent. Des plugins venus d'ailleurs feraient
  tourner du code inconnu sur le serveur du foyer : ce sera une décision à part.
- **Gestion de stock** : autant de tableaux que voulu, chacun avec son nom et une
  image (aucune, une icône, ou une image importée). Un article a une image (aucune,
  icône ou image importée), un nom, une quantité, et — chacun facultatif — un
  minimum, une date de péremption, un lien pour en racheter et un détail. Sous le
  minimum, il rejoint « À racheter » ; près de sa date, « Bientôt périmé ». Une
  tuile « À racheter » les réunit sur l'accueil. « Déclarer une sortie » retire d'un
  coup ce qui a été consommé, utilisé ou jeté, en un ou plusieurs articles.
- **Statuts et droits se modifient sur place** : chaque case se coche ou se décoche,
  et les changements attendent « Enregistrer » dans un bandeau qui les résume ; ✎
  ouvre un statut (nom, couleur, droits). La colonne Administrateur est verrouillée.
- **Mise à jour du serveur : automatique, par un outil à part.** Le serveur ne se met
  pas à jour lui-même — il faudrait lui confier toute la machine. Un outil installé à
  côté (conteneur `maj`, minuteur systemd) lit les réglages de la page (seul ou non,
  heure, majeures, « Mettre à jour maintenant »), sauvegarde, met à jour, revient en
  arrière si la nouvelle version ne répond pas. Sans lui, la page donne la commande.
- **Mot de passe oublié, sans e-mail** : un administrateur génère un code à usage
  unique, valable une heure, et le donne de vive voix.
