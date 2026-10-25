# Maquettes de l'interface web

La partie **authentifiée** de l'interface web décrite dans
[`../web-ui.md`](../web-ui.md) : le foyer au quotidien, et la configuration. Elles
sont dessinées en HTML pour pouvoir être rendues, mesurées et corrigées — plutôt
qu'en image, qu'on ne peut que regarder.

L'assistant d'installation n'est pas ici : il est écrit, servi et joué de bout en
bout dans un vrai navigateur (`scripts/wizard-e2e.js`).

```bash
node docs/mockups/injecter.js   # pose la colonne de navigation partagée
node docs/mockups/rendre.js     # écrit les PNG dans docs/mockups/png/
```

Le script rend chaque écran à **1280 × 800** et signale tout débordement : une
maquette qui déborde ment sur ce qu'elle promet. Il mesure le conteneur défilant, pas
la page — `body` est en `overflow: hidden`, et une maquette coupée passerait sinon
pour correcte.

| Fichier | Écran |
|---|---|
| `1-accueil.html` | Le foyer au quotidien : en retard, aujourd'hui, les rendez-vous de la semaine |
| `2-taches.html` | Toutes les tâches en tableau, avec leur règle lisible |
| `3-foyer.html` | Membres et statuts, invitations, contributions, activité |
| `4-statuts.html` | **Statuts et droits** : la matrice, et les règles qui la protègent |
| `5-statut-modifier.html` | Modifier un statut : ses droits, et qui le porte |
| `6-serveur.html` | Santé, mises à jour, balayages, comptes, réglages du foyer |

## Ce que ces maquettes décident

- **Une colonne de navigation en deux parties** : le foyer au quotidien, puis la
  configuration. Les entrées de configuration ne s'affichent que pour un compte qui
  en a le droit — pas grisées, absentes.
- **La configuration n'existe qu'au navigateur.** Les statuts, leurs droits et les
  réglages du foyer se modifient ici et nulle part ailleurs ; l'app mobile les
  affiche. La page le dit, plutôt que de laisser croire à un réglage introuvable.
- **Les droits se lisent en matrice** : droits en lignes, statuts en colonnes. C'est
  la seule présentation où l'on voit d'un coup ce qu'un enfant peut faire, et ce qui
  distingue deux statuts.
- **Les deux règles qui protègent le foyer sont écrites sur la page**, pas découvertes
  au moment d'un refus : le dernier administrateur ne peut pas perdre ses droits, et
  un statut porté par quelqu'un ne se supprime pas sans dire où vont ses membres.
- **Un changement de droits prend effet immédiatement** : ils sont relus à chaque
  requête, pas portés par le jeton de session. L'écran de modification le dit.
- **Aucun bouton pour retirer quelqu'un du foyer.** La suppression d'un compte existe
  sous *Serveur → Comptes*, pour un titulaire devenu injoignable, et elle anonymise
  au lieu d'effacer.
- **Les contributions comptent des tâches faites**, sans points et sans classement.
- **Aucun sous-titre** sous un titre d'écran : le nom du foyer est dans la colonne, et
  le contenu dit le reste.

Dans ces maquettes, un dégradé coloré tient la place d'une photo de profil.

Ces maquettes sont à valider avant d'écrire la première ligne de la partie
authentifiée.
