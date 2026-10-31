# Contrat d'API REST

Base : `/api/v1` · `Content-Type: application/json` · UTF-8

Ce document est le contrat entre le serveur, l'app Android et l'interface web. Toute
modification cassante passe par une nouvelle version de préfixe (`/api/v2`), jamais
par une mutation silencieuse de `v1`.

> ✅ **Révision faite.** Foyer unique, statuts à droits, profil et photo, tâches
> unifiées (récurrentes, de fond, ponctuelles), groupes, priorités, plus de points :
> tout ce qui suit est servi par le serveur et couvert par `scripts/smoke.sh`, sauf
> ce qui est marqué *(à venir)* — agendas externes, synchronisation mobile,
> notifications. La liste des différences avec la v0.3 est à la fin.

## Conventions

- **Dates** : ISO 8601 en UTC avec `Z` (`2026-10-24T17:30:00Z`). Les champs de type
  jour pur (`scheduledFor`, `dueDate`) sont des `YYYY-MM-DD` en heure locale du foyer.
- **Identifiants** : UUID. Le client **génère** les UUID des objets qu'il crée, ce
  qui rend les `POST` idempotents (voir [`sync.md`](sync.md)).
- **Pagination** : par curseur. `?limit=50&cursor=<opaque>`, réponse
  `{ "data": [...], "nextCursor": "..." | null }`. Pas d'offset : les listes bougent
  entre deux pages.
- **Droits** : chaque route exige un droit du statut de l'appelant
  (`COMPLETE_TASKS`, `MANAGE_TASKS`, …), jamais un nom de statut. Un foyer qui
  renomme « Adulte » en « Grand » ne doit pas changer de comportement.
- **Erreurs** : enveloppe unique.

```json
{
  "error": {
    "code": "TASK_ALREADY_COMPLETED",
    "message": "Cette occurrence est déjà marquée comme faite.",
    "details": { "completedBy": "Marie", "completedAt": "2026-10-24T18:02:11Z" }
  }
}
```

`code` est stable et destiné au code client ; `message` est destiné à l'humain et
peut changer. L'app n'affiche jamais `code` et ne teste jamais `message`.

Codes HTTP : `200` lecture, `201` création, `204` suppression, `400` validation,
`401` non authentifié, `403` droit manquant, `404` inexistant, `409` conflit d'état,
`429` débit dépassé.

## Authentification

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/auth/register` | Création de compte. Fermé si `MH_ALLOW_REGISTRATION=false` |
| `POST` | `/auth/login` | `{ username, password, deviceId, deviceName }` |
| `POST` | `/auth/refresh` | Échange et **rotation** du refresh token |
| `POST` | `/auth/logout` | Révoque le refresh token de cet appareil |
| `GET` | `/auth/me` | Profil, statut et droits effectifs |

`POST /auth/login` →

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "4f3c...",
  "expiresIn": 900,
  "user": {
    "id": "...",
    "firstName": "Marie",
    "lastName": "Dupont",
    "birthDate": "1986-03-12",
    "avatarUrl": "/api/v1/users/.../avatar",
    "status": { "id": "...", "name": "Administrateur" },
    "rights": ["VIEW", "COMPLETE_TASKS", "MANAGE_TASKS", "MANAGE_APPOINTMENTS",
               "MANAGE_MEMBERS", "MANAGE_STATUSES", "MANAGE_SERVER"]
  },
  "household": { "id": "...", "name": "Maison des Dupont", "timezone": "Europe/Paris" }
}
```

**Pas d'adresse e-mail** : un compte se reconnaît à son **identifiant** (`username`),
3 à 32 caractères parmi minuscules, chiffres, `.`, `-` et `_`, en minuscules — « Marie »
et « marie » sont le même compte. Un serveur de maison n'envoie pas de courrier, et
personne n'a à y donner son adresse. Identifiant déjà pris : `409 USERNAME_ALREADY_USED`.

Il n'y a **pas de liste de foyers** : un serveur sert un seul foyer, le client n'a
donc rien à choisir et aucune route ne porte d'identifiant de foyer.

Access token : 15 min, porté par `Authorization: Bearer`. Refresh : 60 jours, rotatif
— sa réutilisation après rotation révoque toute la chaîne (détection de vol).

L'interface web utilise les mêmes routes, en s'annonçant par l'en-tête
`X-MH-Client: web` : le jeton de renouvellement ne figure alors pas dans la réponse, il
est posé dans un cookie `mh_refresh` (`HttpOnly`, `SameSite=Strict`, limité à
`/api/v1/auth`, `Secure` en HTTPS). `refresh` et `logout` le lisent quand le corps n'en
porte pas. Un jeton dans `localStorage` serait lisible par n'importe quel script.

Limites de débit, par IP et par route :

| Route | Limite | Pourquoi |
|---|---|---|
| `POST /auth/login` | 5 / 15 min | Seule porte réellement exposée à la force brute |
| `POST /auth/register` | 20 / 1 h | Un foyer qui s'installe crée cinq ou six comptes d'affilée derrière la même IP familiale : la limite de la connexion bloquait le dernier arrivé |
| `POST /auth/refresh` | 30 / 15 min | Appelé automatiquement par chaque appareil |
| tout le reste | 300 / min | Garde-fou général |

## Mon compte

`GET` et `PUT /users/me/preferences` : les préférences d'affichage du compte — tuiles de
l'accueil (`accueil` : `colonnes` de 1 à 12, `hauteur` en pixels ou absente pour la hauteur
du contenu ; l'ancienne `taille` `S`, `M`, `L` ou `XL` reste acceptée), menu replié
(`navigationRepliee`), page à l'ouverture, thème. Ce qui n'est pas envoyé est gardé.

| Méthode | Route | Droit | Description |
|---|---|---|---|
| `GET` | `/users/me` | — | Profil complet |
| `PATCH` | `/users/me` | — | `firstName`, `lastName`, `birthDate`, `locale`, `timezone` |
| `PUT` | `/users/me/avatar` | — | Photo de profil, `multipart/form-data` |
| `DELETE` | `/users/me/avatar` | — | Retire la photo |
| `POST` | `/users/me/password` | — | `{ currentPassword, newPassword }` |
| `DELETE` | `/users/me` | — | Suppression de compte, voir plus bas |
| `GET` | `/users/:id/avatar` | `VIEW` | Image, mise en cache par `ETag` |

Chacun modifie son nom, son prénom, sa date de naissance et sa photo. **Personne ne
modifie son propre statut** : il n'existe aucune route pour cela, pas même pour un
administrateur sur lui-même. Changer un statut passe par `PATCH /members/:id`.

`PUT /users/me/avatar` prend un `multipart/form-data` dont le champ `file` porte
l'image (JPEG, PNG, WebP, HEIC), jusqu'à 8 Mo. Elle est recompressée en WebP 256 px
et **l'original n'est pas conservé** : un foyer de six personnes ne doit pas coûter
25 Mo de carte SD en photos que personne ne regardera en taille réelle. Un fichier
que le serveur ne sait pas lire comme une image est refusé en `400`, quel que soit
son nom.

Les photos vivent dans `MH_DATA_DIR`, à côté de la base : une sauvegarde doit
prendre les deux (voir [`self-hosting.md`](self-hosting.md)).

## Le foyer

| Méthode | Route | Droit |
|---|---|---|
| `GET` | `/household` | `VIEW` |
| `PATCH` | `/household` | `MANAGE_SERVER` (nom, fuseau, premier jour de semaine) |
| `GET` | `/members` | `VIEW` |
| `PATCH` | `/members/:id` | `MANAGE_MEMBERS` (statut) |
| `POST` | `/invites` | `MANAGE_MEMBERS` |
| `GET` | `/invites` | `MANAGE_MEMBERS` |
| `DELETE` | `/invites/:id` | `MANAGE_MEMBERS` |
| `POST` | `/auth/register` | — (avec `inviteCode`) |

Un code d'invitation s'utilise **à la création du compte**, pas après : sur un
serveur qui ne sert qu'un foyer, avoir un compte *est* en faire partie, et il n'y a
donc rien à « rejoindre » une fois inscrit. `POST /auth/register` accepte
`inviteCode`, exigé dès que les inscriptions libres sont fermées — c'est-à-dire dès
la fin de l'installation.

**Il n'existe aucune route pour sortir quelqu'un du foyer**, pas même soi-même : ni
exclusion, ni départ volontaire. La seule sortie est `DELETE /users/me`. Un `PATCH`
sur un membre change son statut, rien d'autre.

`PATCH /members/:id` est refusé en `409 LAST_ADMIN` s'il retirerait le dernier compte
portant `MANAGE_STATUSES` ou `MANAGE_SERVER` : un foyer sans administrateur est
définitivement bloqué. En revanche supprimer son compte reste toujours possible — les
droits sont alors transmis.

## Statuts et droits

| Méthode | Route | Droit |
|---|---|---|
| `GET` | `/statuses` | `VIEW` |
| `POST` | `/statuses` | `MANAGE_STATUSES` |
| `PATCH` | `/statuses/:id` | `MANAGE_STATUSES` |
| `DELETE` | `/statuses/:id` | `MANAGE_STATUSES` |

Les quatre statuts livrés (Administrateur, Adulte, Enfant, Invité) sont créés par la
migration et n'ont rien de spécial : ils se renomment, se modifient et se suppriment
comme ceux que le foyer créera.

Les quatre mutations ne sont exposées **que par l'interface web** du serveur : l'app
Android lit `/statuses` pour afficher le statut d'un membre, et n'offre aucun écran
pour les modifier. Un réglage qui engage la sécurité du foyer se fait assis, sur un
vrai écran, pas au pouce entre deux portes. Ce n'est pas une restriction technique —
le serveur n'a aucun moyen fiable de savoir qui l'appelle — mais une décision de
produit, tenue côté client.

```json
{
  "id": "...",
  "name": "Adulte",
  "rights": ["VIEW", "COMPLETE_TASKS", "MANAGE_TASKS", "MANAGE_APPOINTMENTS"],
  "isDefault": true,
  "position": 2,
  "memberCount": 2
}
```

`DELETE /statuses/:id?moveMembersTo=<id>` déplace les membres puis supprime le
statut. Sans `moveMembersTo`, il est refusé en `409 STATUS_IN_USE` tant qu'un compte
le porte : supprimer un statut utilisé reviendrait à retirer silencieusement des
droits à quelqu'un.

## Tâches

Une seule ressource pour les trois façons d'être due — récurrente, de fond,
ponctuelle. C'est le `kind` qui change, pas l'endpoint : le foyer ne vit qu'une liste
de choses à faire.

| Méthode | Route | Droit | Description |
|---|---|---|---|
| `GET` | `/tasks` | `VIEW` | `?kind=&groupId=&isActive=` |
| `POST` | `/tasks` | `MANAGE_TASKS` | Création |
| `GET` | `/tasks/:id` | `VIEW` | Définition + dix prochaines échéances, ou vingt dernières fois |
| `PATCH` | `/tasks/:id` | `MANAGE_TASKS` | Regénère les échéances futures en attente |
| `DELETE` | `/tasks/:id` | `MANAGE_TASKS` | Suppression logique ; conserve l'historique |
| `GET` | `/occurrences` | `VIEW` | **L'endpoint principal de l'app** |
| `POST` | `/occurrences/:id/complete` | `COMPLETE_TASKS` | Marque faite. `200` |
| `POST` | `/occurrences/:id/uncomplete` | `COMPLETE_TASKS` | Annule (fenêtre de 48 h). `200` |
| `POST` | `/occurrences/:id/skip` | `COMPLETE_TASKS` | Passe son tour avec un motif. `200` |
| `PATCH` | `/occurrences/:id` | `MANAGE_TASKS` | Réassigner, reporter, annoter |
| `POST` | `/tasks/:id/done` | `COMPLETE_TASKS` | **Tâche de fond faite**, voir plus bas. `201` |

Les trois actions sur une occurrence renvoient **`200`, pas `201`** : elles ne créent
pas de ressource, elles changent un état. Le rejeu renvoie donc le même code que le
premier envoi.

### Créer une tâche

```json
{
  "id": "0192f2a0-...",
  "title": "Sortir les poubelles",
  "kind": "SCHEDULED",
  "groupId": "0192f2b1-...",
  "priority": 1,
  "recurrence": { "form": "WEEKDAYS", "days": ["MO", "TH"] },
  "dueTime": "19:00",
  "graceHours": 24,
  "assignmentMode": "ROTATION",
  "assignees": ["uuid-marie", "uuid-paul"]
}
```

`priority` est un entier de **+3 à −3** : `+3` urgente, `+2` très haute, `+1` haute,
`0` normale, `−1` basse, `−2` très basse, `−3` en dernier. Absent, il vaut `0`.

`recurrence` ne s'applique qu'à `SCHEDULED`, et prend l'une des **cinq formes** que
le foyer formule spontanément :

| `form` | Champs | Exemple |
|---|---|---|
| `DAILY` | `interval` (jours) | Vider le lave-vaisselle, tous les jours |
| `WEEKDAYS` | `days` (`MO`…`SU`) | Poubelles le lundi et le jeudi |
| `MONTH_DAYS` | `days` (1–31, `-1` = dernier jour) | Loyer le 1er, relevé le 15 |
| `YEAR_DATES` | `dates` (`MM-DD`) | Entretien chaudière le 15 septembre |
| `EVERY_N` | `unit` (`WEEK`\|`MONTH`), `interval` | Grand ménage toutes les 3 semaines |

Le serveur traduit la forme en **RRULE RFC 5545**, la stocke, et la renvoie dans
`rrule` à titre informatif. En lecture, chaque tâche porte aussi `recurrence` : sa
règle relue comme l'une des cinq formes, ou `null` quand elle en sort — une règle
affichée de travers serait pire qu'une règle affichée telle quelle. Un client peut
envoyer `rrule` directement, mais l'interface ne montre jamais la règle brute : elle
propose les cinq formes et affiche les trois prochaines dates, parce que personne ne
vérifie une règle dans l'abstrait alors que tout le monde vérifie trois dates.

Deux dates annuelles qui ne partagent ni le jour ni le mois sont refusées en
`400 INVALID_RECURRENCE` : `BYMONTH` × `BYMONTHDAY` est un produit, pas une liste de
couples, et « le 15 mars et le 2 juin » donnerait aussi le 2 mars et le 15 juin.

Selon le `kind` :

| Champ | `kind` | Notes |
|---|---|---|
| `recurrence`, `dueTime`, `graceHours` | `SCHEDULED` | `400 FIELD_NOT_APPLICABLE` sur les autres |
| `maxIntervalSeconds`, `warnRatio` | `BACKGROUND` | Délai maximum, et seuil d'alerte (0,8) |
| `dueDate` | `ONE_OFF` | Date limite, facultative |

`dueTime` absent signifie « toute la journée » : l'échéance est alors la **fin de la
journée locale**, pas minuit — une tâche « du lundi » n'est pas en retard à 00 h 01
le lundi.

Contraintes refusées en `400 INVALID_RECURRENCE` ou `400 INVALID_ASSIGNMENT` :

| Règle | Pourquoi |
|---|---|
| `FREQ` plus fin que `DAILY` | Une tâche de foyer ne se répète pas toutes les heures, et une telle règle générerait des millions d'occurrences |
| `COUNT` et `UNTIL` ensemble | Interdit par la RFC 5545 |
| `interval` hors de 1–366 | |
| `FIXED` sans exactement une personne | Une occurrence n'a qu'un assigné : « plusieurs personnes fixes » n'a pas de traduction. Pour plusieurs personnes, c'est `ROTATION` |
| `ROTATION` à moins de deux personnes | Un tour de rôle à une personne est une tâche fixe |
| `ROTATION` sur une tâche `BACKGROUND` | Un tour de rôle suppose une suite d'échéances ; une tâche de fond n'en a pas |
| `ANYONE` avec une liste | Une tâche ouverte à tous ne désigne personne |
| Un assigné sans `COMPLETE_TASKS` | Il n'aurait pas le droit de faire la tâche : l'assigner serait une impasse |

### Lire les échéances

`GET /occurrences?from=2026-10-24&to=2026-10-31&assigneeId=me&status=PENDING` :

```json
{
  "data": [
    {
      "id": "...",
      "taskId": "...",
      "title": "Sortir les poubelles",
      "kind": "SCHEDULED",
      "priority": 1,
      "group": { "id": "...", "name": "Cuisine", "color": "#0F766E" },
      "scheduledFor": "2026-10-26",
      "dueAt": "2026-10-26T18:00:00Z",
      "status": "PENDING",
      "assignee": { "id": "...", "firstName": "Paul", "avatarUrl": "..." },
      "completedAt": null,
      "completedBy": null,
      "note": null
    }
  ],
  "nextCursor": null
}
```

`title`, `kind`, `priority` et `group` sont recopiés depuis la définition : l'app
affiche une liste sans résoudre les définitions, et reste lisible hors-ligne. `from`
et `to` valent par défaut aujourd'hui et dans sept jours, **en heure locale du
foyer**. `assigneeId=me` évite au client de connaître son propre identifiant.

`POST /occurrences/:id/complete` accepte `{ "completedAt": "...", "note": "..." }`.
`completedAt` sert à déclarer une action faite plus tôt — dimanche soir pour samedi
matin, ou une saisie hors-ligne qui remonte avec sa date réelle. Un instant dans le
futur est refusé (`400`).

Rejeu et conflits :

| Situation | Réponse |
|---|---|
| La même personne recoche, sans `completedAt` | `200`, l'occurrence inchangée. Un double tap n'est pas un conflit avec soi-même |
| La même personne rejoue avec le même `completedAt` | `200`. C'est ce qui rend la file de mutations hors-ligne idempotente |
| Quelqu'un d'autre recoche | `409 TASK_ALREADY_COMPLETED`, avec `details.completedBy` et `details.completedAt` pour que l'app puisse afficher « déjà fait par Marie » |
| Décocher une tâche non faite | `409 TASK_NOT_COMPLETED` |
| Décocher au-delà de 48 h | `409 UNCOMPLETE_WINDOW_CLOSED` |

`PATCH /occurrences/:id` accepte `assigneeId` à `null`, ce qui rend l'occurrence
ouverte à tous — à distinguer d'un champ absent, qui ne change rien.

### Tâches de fond

Une tâche `BACKGROUND` n'a pas de date : elle a un **délai**. Son état est dérivé à
la lecture, jamais stocké — une complétion peut être déclarée dans le passé ou
corrigée, ce qui invaliderait n'importe quel champ mis en cache.

`GET /tasks?kind=BACKGROUND` :

```json
[
  {
    "id": "...",
    "title": "Changer les draps",
    "kind": "BACKGROUND",
    "priority": 0,
    "maxIntervalSeconds": 1209600,
    "warnRatio": 0.8,
    "lastDoneAt": "2026-10-04T09:00:00Z",
    "lastDoneBy": { "id": "...", "firstName": "Marie" },
    "elapsedSeconds": 1728000,
    "state": "OVERDUE",
    "nextDueAt": "2026-10-18T09:00:00Z"
  }
]
```

`state` vaut `NEVER_DONE`, `OK`, `DUE_SOON` ou `OVERDUE`. `elapsedSeconds` est fourni
en plus de `lastDoneAt` pour que l'app affiche « il y a 20 jours » sans dépendre de
l'horloge du téléphone, souvent décalée.

Une tâche de fond sans `maxIntervalSeconds` ne fait que compter le temps écoulé : elle
ne passe jamais en retard, et `nextDueAt` reste `null`.

`POST /tasks/:id/done` : `{ "id": "<uuid client>", "completedAt": "...", "note": "..." }`.
L'appel crée une occurrence `DONE` datée — c'est le journal qui faisait l'intérêt des
anciens compteurs, et il est conservé. L'UUID client rend l'appel idempotent : un
double tap ou un rejeu hors-ligne ne crée pas deux entrées. Un instant futur est
refusé (`400`).

Ses entrées se lisent et se corrigent comme toute occurrence :
`GET /occurrences?taskId=...`, puis `POST /occurrences/:id/uncomplete` pour revenir
sur une saisie erronée.

### Groupes de tâches

| Méthode | Route | Droit |
|---|---|---|
| `GET` | `/task-groups` | `VIEW` |
| `POST` | `/task-groups` | `MANAGE_TASKS` |
| `PATCH` | `/task-groups/:id` | `MANAGE_TASKS` |
| `DELETE` | `/task-groups/:id` | `MANAGE_TASKS` |

Une tâche appartient à **un groupe au plus**. `DELETE` détache les tâches du groupe au
lieu de les supprimer : perdre une corvée parce qu'on a rangé une étiquette serait une
mauvaise surprise.

## Rendez-vous

| Méthode | Route | Droit | Description |
|---|---|---|---|
| `GET` | `/appointments` | `VIEW` | `?from=&to=` (obligatoires, `YYYY-MM-DD`) |
| `POST` | `/appointments` | `MANAGE_APPOINTMENTS` | |
| `GET` | `/appointments/:id` | `VIEW` | |
| `PATCH` | `/appointments/:id` | `MANAGE_APPOINTMENTS` | `409 APPOINTMENT_READ_ONLY` si importé |
| `DELETE` | `/appointments/:id` | `MANAGE_APPOINTMENTS` | |
| `POST` | `/appointments/:id/respond` | `VIEW` | `{ "response": "ACCEPTED" }`. `200` |
| `GET` | `/agenda` | `VIEW` | Vue fusionnée, ci-dessous |

Les récurrences sont **déroulées à la lecture**, pas matérialisées : un rendez-vous ne
s'assigne pas et ne se complète pas, il n'y a rien à y accrocher. Chaque instance
porte `appointmentId` et `isRecurring` ; comme pour les tâches, la règle est déroulée
en heure locale du foyer, donc un rendez-vous hebdomadaire à 15 h 30 reste à 15 h 30
après un changement d'heure.

**Visibilité.** Un rendez-vous `PRIVATE` n'est visible que de son auteur et de ses
invités ; pour les autres il n'existe pas — `404`, pas `403`, et absent des listes.

Répondre à une invitation ne demande pas `MANAGE_APPOINTMENTS`, mais on ne répond que
pour soi : `400 NOT_INVITED` si l'on n'est pas dans la liste.

`GET /agenda?from=&to=` est ce qu'affiche l'écran d'accueil : une liste unique triée
par instant, chaque entrée portant son `type`.

```json
{
  "from": "2026-10-25",
  "to": "2026-11-01",
  "data": [
    { "type": "TASK", "id": "...", "title": "Sortir les poubelles", "at": "2026-10-26T18:00:00Z", "status": "PENDING", "priority": 1, "assignee": { "id": "...", "firstName": "Paul" } },
    { "type": "APPOINTMENT", "id": "...", "title": "Dentiste", "at": "2026-10-27T15:30:00Z", "endAt": "2026-10-27T16:15:00Z", "location": "Cabinet Martin" },
    { "type": "BACKGROUND_DUE", "id": "...", "title": "Changer les draps", "at": "2026-10-18T09:00:00Z", "state": "OVERDUE" }
  ]
}
```

Fusionner côté serveur évite de réimplémenter le tri, les fuseaux et les règles de
visibilité dans l'app Android, dans l'interface web, et dans tout ce qui viendra
ensuite. Une tâche de fond n'entre dans l'agenda que si son délai arrive à terme dans
la fenêtre — ou s'il est déjà dépassé, sinon elle disparaîtrait de la vue au moment où
elle compte le plus. La fenêtre par défaut est **la semaine qui vient**, ce que
l'écran d'accueil montre sous « Rendez-vous de la semaine ».

## Agendas externes *(à venir — v0.7)*

**Chaque compte lie son propre agenda** : ces routes sont sous `/users/me`, pas sous
le foyer, parce qu'un agenda appartient à la personne.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/users/me/calendars` | Mes comptes d'agenda |
| `POST` | `/users/me/calendars/caldav` | `{ url, username, password }` |
| `POST` | `/users/me/calendars/ics` | `{ url }` |
| `GET` | `/users/me/calendars/google/authorize` | Renvoie l'URL de consentement |
| `GET` | `/calendars/google/callback` | Callback OAuth (hors `/api`, non authentifié) |
| `PATCH` | `/users/me/calendars/:id` | `busyOnly`, `defaultVisibility`, `isActive` |
| `DELETE` | `/users/me/calendars/:id` | Supprime le compte et ses événements importés |
| `POST` | `/users/me/calendars/:id/sync` | Force une synchro |

Les identifiants sont **écrits seulement** : aucune route ne les relit, y compris
pour le propriétaire.

## Synchronisation mobile *(à venir — v0.4)*

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/sync/delta` | `?since=<cursor>` — tout ce qui a changé |
| `POST` | `/sync/push` | Lot de mutations faites hors-ligne |

Détails du protocole, résolution des conflits et format des lots :
[`sync.md`](sync.md).

## Notifications *(à venir — v0.8)*

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/users/me/devices` | Enregistre un token push |
| `DELETE` | `/users/me/devices/:id` | |
| `GET` | `/users/me/notification-prefs` | |
| `PATCH` | `/users/me/notification-prefs` | Heures de silence, canaux |

## Activité et contributions

| Méthode | Route | Droit | Description |
|---|---|---|---|
| `GET` | `/activity` | `VIEW` | Fil du foyer, paginé par curseur |
| `GET` | `/stats/contributions` | `VIEW` | *(à venir)* `?from=&to=` — tâches faites par membre |

Le fil est dénormalisé : son texte est figé à l'écriture, pour rester lisible après
suppression de l'objet concerné. En revanche le **nom de l'auteur n'y est pas
recopié** — il est résolu depuis la table des comptes, ce qui fait qu'anonymiser un
compte supprimé anonymise tout son historique d'un coup.

`/stats/contributions` compte des **tâches faites**, pas des points : il n'existe plus
de système de points. La réponse est volontairement factuelle et ne produit **aucun
classement** — un outil de foyer qui désigne un mauvais élève crée des conflits au
lieu d'en résoudre.

## Suppression de compte

`DELETE /users/me` — `{ "password": "..." }`.

C'est la seule sortie du foyer. Le compte est **anonymisé** plutôt qu'effacé, pour que
l'historique garde un auteur sans garder une identité : nom, prénom, identifiant, date de
naissance, photo, agendas et appareils disparaissent ; les tâches faites restent au
nom d'« Ancien membre ».

Une suppression ne peut pas être refusée. Si le compte est le dernier à porter
`MANAGE_SERVER` ou `MANAGE_STATUSES`, les droits passent au compte actif le plus
ancien ; l'app l'annonce **avant** de confirmer, parce qu'apprendre après coup qu'on a
transmis l'administration du foyer serait une mauvaise surprise.

## Installation

Hors de `/api/v1` : ces routes précèdent l'existence de tout compte, et l'app doit
pouvoir les atteindre avant de savoir quoi que ce soit du serveur. Déroulé complet,
protections et points durs : [`setup-wizard.md`](setup-wizard.md).

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/setup/state` | Étapes, laquelle est courante, ce qui est applicable |
| `POST` | `/setup/network` | Appliquer une configuration réseau *(image Raspberry Pi)* |
| `GET` | `/setup/network/scan` | Réseaux Wi-Fi détectés *(image Raspberry Pi)* |
| `POST` | `/setup/pairing` | `{ "purpose": "IMPORT" \| "CLAIM" }` → code, expiration, QR code (`qrSvg`, `link`), adresse locale et empreinte affichée |
| `GET` | `/setup/pairing/:code` | `PENDING`, `USED` ou `EXPIRED` |
| `POST` | `/setup/import` | Appelé **par l'app** : pousse sa configuration locale |
| `POST` | `/setup/skip` | Passe une étape facultative |
| `POST` | `/setup/household` | Le nom du foyer |
| `POST` | `/setup/claim` | Appelé **par l'app** : crée le compte administrateur, ouvre une session |
| `POST` | `/setup/complete` | Verrouille l'assistant et ferme les inscriptions |

Toutes répondent :

| Code | Quand |
|---|---|
| `409 SETUP_ALREADY_DONE` | L'installation est terminée — il n'y a plus rien à installer |
| `403 SETUP_REMOTE_FORBIDDEN` | La requête vient d'une adresse publique |
| `403 SETUP_TOKEN_REQUIRED` | Un reverse proxy masque l'adresse d'origine : le jeton affiché dans les journaux au premier démarrage est exigé, dans l'en-tête `X-Setup-Token` |
| `403 SETUP_WINDOW_CLOSED` | Plus de 24 h sans compte créé : redémarrer le serveur réarme l'assistant |
| `400 SETUP_NOT_APPLICABLE` | L'étape n'existe pas sur cette installation (le réseau, hors image Raspberry Pi) |
| `400 PAIRING_INVALID` | Code d'appariement inconnu, expiré, ou déjà utilisé |

`POST /setup/import` reprend le foyer d'un téléphone utilisé sans serveur : nom et fuseau,
**groupes** (`groups`), tâches **récurrentes** et **ponctuelles** (`tasks`, `kind` =
`SCHEDULED` ou `ONE_OFF` avec `dueDate`), tâches **de fond** (`backgroundTasks`, avec
`lastDoneAt` pour ne pas repartir à « jamais faite ») et rendez-vous. Les identifiants
du téléphone sont conservés, les tâches gardent leur groupe.

Il **stocke** la configuration au lieu de l'appliquer : les tâches
ont besoin d'un auteur, et aucun compte n'existe à cette étape. Tout est créé au
moment où le compte administrateur l'est, et les occurrences des tâches importées sont
matérialisées dans la foulée — sinon le foyer s'ouvrirait sur une liste vide alors que
ses tâches viennent d'arriver.

`POST /setup/claim` rend une session complète, comme `/auth/login` : le téléphone qui
vient de créer le compte est déjà connecté. Le compte reçoit le statut
« Administrateur », qui porte tous les droits.

## Mises à jour

Le serveur regarde une fois par jour s'il existe une version plus récente de
lui-même et de l'application. **Rien n'est envoyé** : il lit une page de
publications. `MH_UPDATE_CHECK=false` coupe entièrement ces appels sortants.

| Méthode | Route | Qui |
|---|---|---|
| `GET` | `/app-release` | Public : l'app l'interroge avant toute connexion |
| `GET` | `/api/v1/admin/updates` | `MANAGE_SERVER` |
| `POST` | `/api/v1/admin/jobs/releases.check/run` | `MANAGE_SERVER` : vérifier tout de suite |

L'état des mises à jour **n'est pas** exposé sur `/version`, qui est public :
annoncer à tout visiteur qu'un serveur est en retard d'une version, c'est lui
indiquer quelles failles essayer.

`GET /app-release` :

```json
{
  "version": "v0.9.1",
  "publishedAt": "2026-10-21T10:00:00Z",
  "downloadUrl": "https://github.com/.../myhousehold-0.9.1.apk",
  "sha256": "3b1f2c…",
  "serverVersion": "0.3.0",
  "checkedAt": "2026-10-25T04:23:00Z"
}
```

C'est **le serveur qui dit à l'app quelle version installer**, et non le téléphone
qui va chercher la dernière existante : un serveur en v0.4 n'a aucune raison de
pousser les téléphones du foyer vers une app qui parlera une API qu'il ne connaît
pas. `sha256` est lu dans les notes de la version publiée et vérifié par l'app avant
toute installation.

Une vérification impossible — pas d'accès sortant, serveur injoignable, réponse
illisible — est une information, pas une panne : elle est consignée dans
`lastError` et le foyer continue de fonctionner.

## Santé

Hors du préfixe `/api/v1`, pour rester triviales à interroger :

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | Non authentifié. État de la base et de Redis |
| `GET` | `/version` | Version du serveur et environnement |
| `GET` | `/identity` | Version et empreinte du certificat ; nom du foyer, au réseau local seulement |

### Joindre le serveur depuis le téléphone

Le serveur écoute en **HTTPS sur le port 3443** (`MH_HTTPS_PORT`), avec un certificat
auto-signé créé au premier démarrage dans `MH_DATA_DIR` et **jamais régénéré**. L'app
ne s'appuie pas sur une autorité de certification : elle retient l'**empreinte**
(SHA-256 du certificat) et refuse tout autre certificat ensuite.

- **QR code** de l'assistant : `myhousehold://serveur?adresse=…&empreinte=…&code=…`.
  L'empreinte y est entière, la vérification est automatique.
- **Adresse saisie, ou serveur trouvé sur le Wi-Fi** : l'app affiche les 24 premiers
  caractères de l'empreinte (`7F3A 91C2 0B5E D4A8 6E17 C93F`), à comparer avec ceux de
  la page web. Derrière un reverse proxy avec un certificat reconnu, rien à comparer.
- **Annonce sur le Wi-Fi** (mDNS) : service `_myhousehold._tcp`, port 3443, nommé
  d'après le foyer. `MH_MDNS=false` la coupe.

```json
{ "status": "ok", "components": { "database": { "status": "up" }, "redis": { "status": "up" } } }
```

`status` vaut `degraded` si Redis est indisponible mais la base accessible : Redis ne
porte que la file de jobs, son absence n'empêche pas de répondre.

## Ce qui change par rapport à la v0.3

Le serveur servi aujourd'hui expose encore le contrat précédent. La reprise, suivie
dans [`roadmap.md`](roadmap.md), consiste en :

| v0.3 | Décidé |
|---|---|
| `/households/:householdId/tasks`, … | `/tasks`, … — un serveur, un foyer |
| `POST /households`, `GET /households/:id` | `GET /household`, `PATCH /household` |
| `role` (`OWNER`\|`ADULT`\|`CHILD`\|`GUEST`) | `statusId` + droits, configurables depuis l'interface web |
| `isServerAdmin` | droit `MANAGE_SERVER` |
| `/counters`, `/counters/:id/events` | `/tasks?kind=BACKGROUND`, `POST /tasks/:id/done` |
| `type: "COUNTER_DUE"` dans `/agenda` | `type: "BACKGROUND_DUE"` |
| `points` sur les tâches et l'agenda | retiré |
| `displayName` | `firstName`, `lastName`, `birthDate`, `avatarUrl` |
| `rrule` brute à la création | les cinq formes de `recurrence` (la RRULE reste acceptée) |
| — | `priority`, `groupId`, `kind`, `/task-groups`, `/statuses` |

## OpenAPI

Le schéma est généré par les décorateurs NestJS et servi sur `/api/docs` (désactivé
si `NODE_ENV=production` et `MH_EXPOSE_DOCS=false`). Il sert aussi à générer le
client Android : le contrat ne peut donc pas dériver du code sans que le build
l'affiche.
