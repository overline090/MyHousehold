# Contrat d'API REST

Base : `/api/v1` · `Content-Type: application/json` · UTF-8

Ce document est le contrat entre le serveur et l'app Android. Toute modification
cassante passe par une nouvelle version de préfixe (`/api/v2`), jamais par une
mutation silencieuse de `v1`.

**État d'implémentation** (v0.3) : tout est implémenté et couvert par
`scripts/smoke.sh`, sauf les **agendas externes**, la **synchronisation mobile** et
les **notifications**, qui restent spécifiés mais pas écrits — périmètre des versions
suivantes de [`roadmap.md`](roadmap.md). Les sections concernées sont marquées
*(à venir)*.

## Conventions

- **Dates** : ISO 8601 en UTC avec `Z` (`2026-10-24T17:30:00Z`). Les champs de type
  jour pur (`scheduledFor`) sont des `YYYY-MM-DD` en heure locale du foyer.
- **Identifiants** : UUID. Le client **génère** les UUID des objets qu'il crée, ce
  qui rend les `POST` idempotents (voir [`sync.md`](sync.md)).
- **Pagination** : par curseur. `?limit=50&cursor=<opaque>`, réponse
  `{ "data": [...], "nextCursor": "..." | null }`. Pas d'offset : les listes bougent
  entre deux pages.
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
`401` non authentifié, `403` authentifié mais rôle insuffisant, `404` inexistant *ou
hors de vos foyers*, `409` conflit d'état, `429` débit dépassé.

## Authentification

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/auth/register` | Création de compte. Fermé si `MH_ALLOW_REGISTRATION=false` |
| `POST` | `/auth/login` | `{ email, password, deviceId, deviceName }` |
| `POST` | `/auth/refresh` | Échange et **rotation** du refresh token |
| `POST` | `/auth/logout` | Révoque le refresh token de cet appareil |
| `GET` | `/auth/me` | Profil + liste des foyers et rôles |

`POST /auth/login` →

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "4f3c...",
  "expiresIn": 900,
  "user": {
    "id": "...",
    "displayName": "Marie",
    "email": "...",
    "isServerAdmin": false
  },
  "households": [
    { "id": "...", "name": "Maison", "timezone": "Europe/Paris", "role": "OWNER" }
  ]
}
```

`isServerAdmin` distingue l'administrateur de l'**instance** du rôle dans un foyer.
Le premier compte créé sur un serveur neuf l'obtient.

Access token : 15 min, porté par `Authorization: Bearer`. Refresh : 60 jours, rotatif
— sa réutilisation après rotation révoque toute la chaîne (détection de vol).

Limites de débit, par IP et par route :

| Route | Limite | Pourquoi |
|---|---|---|
| `POST /auth/login` | 5 / 15 min | Seule porte réellement exposée à la force brute |
| `POST /auth/register` | 20 / 1 h | Un foyer qui s'installe crée cinq ou six comptes d'affilée derrière la même IP familiale : la limite de la connexion bloquait le dernier arrivé |
| `POST /auth/refresh` | 30 / 15 min | Appelé automatiquement par chaque appareil |
| tout le reste | 300 / min | Garde-fou général |

## Foyers

| Méthode | Route | Rôle requis |
|---|---|---|
| `POST` | `/households` | — (devient `OWNER`) |
| `GET` | `/households/:id` | membre |
| `PATCH` | `/households/:id` | `OWNER` |
| `DELETE` | `/households/:id` | `OWNER` |
| `GET` | `/households/:id/members` | membre |
| `PATCH` | `/households/:id/members/:userId` | `OWNER` (changer de rôle, le surnom) |
| `POST` | `/households/:id/invites` | `OWNER` |
| `GET` | `/households/:id/invites` | `OWNER` |
| `DELETE` | `/invites/:id` | `OWNER` |
| `POST` | `/invites/:code/accept` | authentifié |

**Il n'existe aucune route pour sortir quelqu'un d'un foyer**, pas même soi-même :
ni exclusion, ni départ volontaire. La seule sortie est `DELETE /users/me`, décrite
plus bas. Un `PATCH` sur un membre change son rôle ou son surnom, rien d'autre.

Un `OWNER` ne peut pas se rétrograder s'il est le dernier (`409 LAST_OWNER`) : il
doit d'abord transmettre le rôle. En revanche, supprimer son compte reste toujours
possible — la propriété est alors transmise automatiquement.

Toutes les routes ci-dessous sont préfixées par `/households/:householdId`.

## Tâches

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/tasks` | Définitions. `?isActive=true` |
| `POST` | `/tasks` | Création (rôle `ADULT`+) |
| `GET` | `/tasks/:id` | Définition + dix prochaines échéances |
| `PATCH` | `/tasks/:id` | Modifie la règle ; regénère les échéances futures en attente |
| `DELETE` | `/tasks/:id` | Suppression logique ; conserve l'historique |
| `GET` | `/occurrences` | **L'endpoint principal de l'app** |
| `POST` | `/occurrences/:id/complete` | Marque faite |
| `POST` | `/occurrences/:id/uncomplete` | Annule (fenêtre de 48 h) |
| `POST` | `/occurrences/:id/skip` | Passe son tour avec un motif |
| `PATCH` | `/occurrences/:id` | Réassigner, reporter, annoter (rôle `ADULT`+) |

Les trois actions sur une occurrence renvoient **`200`, pas `201`** : elles ne créent
pas de ressource, elles changent un état. Le rejeu renvoie donc le même code que le
premier envoi.

`POST /tasks` :

```json
{
  "id": "0192f2a0-...",
  "title": "Sortir les poubelles",
  "rrule": "FREQ=WEEKLY;BYDAY=MO",
  "dueTime": "19:00",
  "assignmentMode": "ROTATION",
  "assignees": ["uuid-marie", "uuid-paul"],
  "graceHours": 24,
  "points": 2
}
```

Contraintes refusées en `400 INVALID_RRULE` ou `400 INVALID_ASSIGNMENT` :

| Règle | Pourquoi |
|---|---|
| `FREQ` plus fin que `DAILY` | Une tâche de foyer ne se répète pas toutes les heures, et une telle règle générerait des millions d'occurrences |
| `COUNT` et `UNTIL` ensemble | Interdit par la RFC 5545 |
| `INTERVAL` hors de 1–366 | |
| `FIXED` sans exactement une personne | Une occurrence n'a qu'un assigné : « plusieurs personnes fixes » n'a pas de traduction. Pour plusieurs personnes, c'est `ROTATION` |
| `ROTATION` à moins de deux personnes | Un tour de rôle à une personne est une tâche fixe |
| `ANYONE` avec une liste | Une tâche ouverte à tous ne désigne personne |
| Un assigné hors du foyer, ou invité | Un invité n'a pas le droit de compléter : l'assigner serait une impasse |

`dueTime` absent signifie « toute la journée » : l'échéance est alors la **fin de la
journée locale**, pas minuit — une tâche « du lundi » n'est pas en retard à 00 h 01
le lundi.

`GET /occurrences?from=2026-10-24&to=2026-10-31&assigneeId=me&status=PENDING` :

```json
{
  "data": [
    {
      "id": "...",
      "taskDefinitionId": "...",
      "title": "Sortir les poubelles",
      "category": null,
      "points": 2,
      "scheduledFor": "2026-10-26",
      "dueAt": "2026-10-26T18:00:00Z",
      "status": "PENDING",
      "assignee": { "id": "...", "displayName": "Paul" },
      "completedAt": null,
      "completedBy": null,
      "note": null
    }
  ],
  "nextCursor": null
}
```

`title`, `category` et `points` sont recopiés depuis la définition : l'app affiche
une liste sans résoudre les définitions, et reste lisible hors-ligne. `from` et `to`
valent par défaut aujourd'hui et dans sept jours, **en heure locale du foyer**.
`assigneeId=me` évite au client de connaître son propre identifiant.

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

## Compteurs

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/counters` | Avec l'état dérivé. `?isActive=true` |
| `POST` | `/counters` | Création (rôle `ADULT`+) |
| `GET` | `/counters/:id` | Définition + vingt derniers événements |
| `PATCH` | `/counters/:id` | |
| `DELETE` | `/counters/:id` | Suppression logique |
| `POST` | `/counters/:id/events` | **Remet le compteur à zéro**. `200` |
| `GET` | `/counters/:id/events` | Historique paginé par curseur |
| `DELETE` | `/counters/:id/events/:eventId` | Corrige une saisie erronée |

`GET /counters` :

```json
[
  {
    "id": "...",
    "title": "Changer les draps",
    "targetIntervalSeconds": 1209600,
    "warnRatio": 0.8,
    "lastEventAt": "2026-10-04T09:00:00Z",
    "elapsedSeconds": 1728000,
    "status": "OVERDUE",
    "nextDueAt": "2026-10-18T09:00:00Z"
  }
]
```

`status` vaut `NEVER_DONE`, `OK`, `DUE_SOON` ou `OVERDUE`, et n'est **jamais stocké** :
un événement peut être ajouté dans le passé ou supprimé, ce qui invaliderait n'importe
quel champ mis en cache. `elapsedSeconds` est fourni en plus de `lastEventAt` pour que
l'app affiche « il y a 20 jours » sans dépendre de l'horloge du téléphone, souvent
décalée.

Un compteur sans `targetIntervalSeconds` ne fait que compter : il ne passe jamais en
retard, et `nextDueAt` reste `null`.

`POST /counters/:id/events` : `{ "id": "<uuid client>", "occurredAt": "...", "note": "..." }`.
L'UUID client rend l'appel idempotent — un double tap ou un rejeu hors-ligne ne crée
pas deux événements. `occurredAt` permet de déclarer dimanche soir une action faite
samedi matin ; un instant futur est refusé (`400`).

Remettre à zéro demande le rôle `CHILD`+ : c'est faire l'action. Créer ou modifier un
compteur demande `ADULT`+.

## Rendez-vous

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/appointments` | `?from=&to=` (obligatoires, `YYYY-MM-DD`) |
| `POST` | `/appointments` | Rôle `ADULT`+ |
| `GET` | `/appointments/:id` | |
| `PATCH` | `/appointments/:id` | `409 APPOINTMENT_READ_ONLY` si importé |
| `DELETE` | `/appointments/:id` | |
| `POST` | `/appointments/:id/respond` | `{ "response": "ACCEPTED" }`. `200` |
| `GET` | `/agenda` | Vue fusionnée, ci-dessous |

Les récurrences sont **déroulées à la lecture**, pas matérialisées : un rendez-vous ne
s'assigne pas et ne se complète pas, il n'y a rien à y accrocher. Chaque instance
porte `appointmentId` et `isRecurring` ; comme pour les tâches, la règle est déroulée
en heure locale du foyer, donc un rendez-vous hebdomadaire à 15 h 30 reste à 15 h 30
après un changement d'heure.

**Visibilité.** Un rendez-vous `PRIVATE` n'est visible que de son auteur et de ses
invités ; pour les autres il n'existe pas — `404`, pas `403`, et absent des listes.

Répondre à une invitation ne demande aucun rôle particulier, mais on ne répond que
pour soi : `400 NOT_INVITED` si l'on n'est pas dans la liste.

`GET /agenda?from=&to=` est ce qu'affiche l'écran d'accueil : une liste unique triée
par instant, chaque entrée portant son `type`.

```json
{
  "from": "2026-10-24",
  "to": "2026-10-26",
  "data": [
    { "type": "TASK", "id": "...", "title": "Sortir les poubelles", "at": "2026-10-24T17:00:00Z", "status": "PENDING", "assignee": { "id": "...", "displayName": "Paul" }, "points": 2 },
    { "type": "APPOINTMENT", "id": "...", "title": "Dentiste", "at": "2026-10-25T15:30:00Z", "endAt": "2026-10-25T16:15:00Z", "location": "Cabinet Martin" },
    { "type": "COUNTER_DUE", "id": "...", "title": "Changer les draps", "at": "2026-10-18T09:00:00Z", "status": "OVERDUE" }
  ]
}
```

Fusionner côté serveur évite de réimplémenter le tri, les fuseaux et les règles de
visibilité dans l'app Android, dans l'interface web, et dans tout ce qui viendra
ensuite. Un compteur n'entre dans l'agenda que s'il arrive à échéance dans la fenêtre
— ou s'il est déjà en retard, sinon il disparaîtrait de la vue au moment où il compte
le plus.

## Agendas externes *(à venir — v0.7)*

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/users/me/calendars` | Mes comptes (hors foyer : c'est personnel) |
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

## Activité et statistiques

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/activity` | Fil du foyer, paginé par curseur |
| `GET` | `/stats/contributions` | *(à venir)* `?from=&to=` — points et tâches par membre |

Le fil est dénormalisé : son texte est figé à l'écriture, pour rester lisible après
suppression de l'objet concerné. En revanche le **nom de l'auteur n'y est pas
recopié** — il est résolu depuis la table des comptes, ce qui fait qu'anonymiser un
compte supprimé anonymise tout son historique d'un coup.

`/stats/contributions` sera volontairement factuel (qui a fait quoi, combien de
points) et ne produira **aucun classement**. Un outil de foyer qui désigne un mauvais
élève crée des conflits au lieu d'en résoudre.

## Installation

Hors de `/api/v1` : ces routes précèdent l'existence de tout compte, et l'app doit
pouvoir les atteindre avant de savoir quoi que ce soit du serveur. Déroulé complet,
protections et points durs : [`setup-wizard.md`](setup-wizard.md).

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/setup/state` | Étapes, laquelle est courante, ce qui est applicable |
| `POST` | `/setup/network` | Appliquer une configuration réseau *(image Raspberry Pi)* |
| `GET` | `/setup/network/scan` | Réseaux Wi-Fi détectés *(image Raspberry Pi)* |
| `POST` | `/setup/pairing` | `{ "purpose": "IMPORT" \| "CLAIM" }` → code, URL, expiration |
| `GET` | `/setup/pairing/:code` | `PENDING`, `USED` ou `EXPIRED` |
| `POST` | `/setup/import` | Appelé **par l'app** : pousse sa configuration locale |
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

`POST /setup/import` **stocke** la configuration au lieu de l'appliquer : les tâches
et les compteurs ont besoin d'un auteur, et aucun compte n'existe à cette étape. Tout
est créé au moment où le compte administrateur l'est, et les occurrences des tâches
importées sont matérialisées dans la foulée — sinon le foyer s'ouvrirait sur une liste
vide alors que ses tâches viennent d'arriver.

`POST /setup/claim` rend une session complète, comme `/auth/login` : le téléphone qui
vient de créer le compte est déjà connecté.

## Santé

Hors du préfixe `/api/v1`, pour rester triviales à interroger :

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | Non authentifié. État de la base et de Redis |
| `GET` | `/version` | Version du serveur et environnement |

```json
{ "status": "ok", "components": { "database": { "status": "up" }, "redis": { "status": "up" } } }
```

`status` vaut `degraded` si Redis est indisponible mais la base accessible : Redis ne
porte que la file de jobs, son absence n'empêche pas de répondre.

## OpenAPI

Le schéma est généré par les décorateurs NestJS et servi sur `/api/docs` (désactivé
si `NODE_ENV=production` et `MH_EXPOSE_DOCS=false`). Il sert aussi à générer le
client Android : le contrat ne peut donc pas dériver du code sans que le build
l'affiche.
