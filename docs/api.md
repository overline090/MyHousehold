# Contrat d'API REST

Base : `/api/v1` · `Content-Type: application/json` · UTF-8

Ce document est le contrat entre le serveur et l'app Android. Toute modification
cassante passe par une nouvelle version de préfixe (`/api/v2`), jamais par une
mutation silencieuse de `v1`.

**État d'implémentation** (v0.2) : les sections *Authentification*, *Foyers*,
*Tâches*, *Compte* et *Administration de l'instance* sont implémentées et couvertes
par `scripts/smoke.sh`. Tout le reste — compteurs, rendez-vous,
agendas, synchronisation, notifications, activité — est **spécifié mais pas encore
écrit** ; c'est le périmètre des versions suivantes de
[`roadmap.md`](roadmap.md). Les sections concernées sont marquées *(à venir)*.

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

## Compteurs *(à venir — v0.3)*

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/counters` | Avec l'état dérivé calculé |
| `POST` | `/counters` | Création |
| `GET` | `/counters/:id` | Définition + 20 derniers événements |
| `PATCH` | `/counters/:id` | |
| `DELETE` | `/counters/:id` | |
| `POST` | `/counters/:id/events` | **Remet le compteur à zéro** |
| `GET` | `/counters/:id/events` | Historique paginé |
| `DELETE` | `/counters/:id/events/:eventId` | Corrige une erreur de saisie |

`GET /counters` :

```json
{
  "data": [
    {
      "id": "...",
      "title": "Changer les draps",
      "targetInterval": "P14D",
      "lastEvent": {
        "occurredAt": "2026-10-10T09:00:00Z",
        "recordedBy": { "id": "...", "displayName": "Marie" }
      },
      "elapsedSeconds": 1241400,
      "status": "OVERDUE",
      "nextDueAt": "2026-10-24T09:00:00Z"
    }
  ]
}
```

`elapsedSeconds` est fourni **en plus** de `lastEvent.occurredAt` pour que l'app
affiche « il y a 14 jours » sans dépendre de l'horloge du téléphone, souvent décalée.

`POST /counters/:id/events` : `{ "id": "<uuid client>", "occurredAt": "...", "note": "..." }`.
L'UUID client rend l'appel idempotent — un double tap ou un rejeu hors-ligne ne crée
pas deux événements.

## Rendez-vous *(à venir — v0.3)*

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/appointments` | `?from=&to=` (obligatoires, fenêtre max 1 an) |
| `POST` | `/appointments` | |
| `GET` | `/appointments/:id` | |
| `PATCH` | `/appointments/:id` | `409 APPOINTMENT_READ_ONLY` si importé |
| `DELETE` | `/appointments/:id` | |
| `POST` | `/appointments/:id/respond` | `{ "response": "ACCEPTED" }` |
| `GET` | `/agenda` | Vue fusionnée : rdv + occurrences + échéances de compteurs |

`GET /agenda?from=&to=` est ce qu'affiche l'écran d'accueil : une liste unique triée,
chaque entrée portant son `type` (`APPOINTMENT`, `TASK`, `COUNTER_DUE`). Fusionner
côté serveur évite de réimplémenter trois fois le tri et la gestion des fuseaux dans
le client.

## Agendas externes *(à venir — v0.5)*

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

## Notifications *(à venir — v0.6)*

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/users/me/devices` | Enregistre un token push |
| `DELETE` | `/users/me/devices/:id` | |
| `GET` | `/users/me/notification-prefs` | |
| `PATCH` | `/users/me/notification-prefs` | Heures de silence, canaux |

## Activité et statistiques *(à venir — v0.3)*

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/activity` | Fil du foyer, paginé |
| `GET` | `/stats/contributions` | `?from=&to=` — points et tâches par membre |

`/stats/contributions` est volontairement factuel (qui a fait quoi, combien de
points) et ne produit **aucun classement**. Un outil de foyer qui désigne un mauvais
élève crée des conflits au lieu d'en résoudre.

## Compte

| Méthode | Route | Description |
|---|---|---|
| `DELETE` | `/users/me` | Supprimer son compte. Corps : `{ "password": "..." }` |

Irréversible. Le mot de passe est exigé parce qu'une session volée ne doit pas
suffire à déclencher une suppression. Réponse `204`, et le jeton d'accès est
immédiatement invalide.

Ce que la suppression fait, en une phrase : le compte est **anonymisé** (`Ancien
membre`, adresse rendue inutilisable), ses secrets (jetons, appareils, agendas) sont
effacés, et l'historique du foyer reste intact sous ce nom anonyme. Si le compte
était le dernier propriétaire d'un foyer, la propriété passe au membre le plus ancien
(adulte d'abord, sinon enfant) ; sans successeur, le foyer est supprimé. Détail
complet dans [`data-model.md`](data-model.md#suppression-de-compte).

Erreurs : `401 INVALID_CREDENTIALS` si le mot de passe est faux.

## Administration de l'instance

Réservé aux comptes `isServerAdmin`. Un non-administrateur reçoit `404` — l'existence
de cette zone n'a pas à lui être confirmée.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/admin/users` | Comptes de l'instance. `?includeDeleted=true` inclut les comptes anonymisés |
| `DELETE` | `/admin/users/:userId` | Supprimer le compte d'un membre. Corps : `{ "password": "..." }` (celui de l'administrateur) |
| `POST` | `/admin/jobs/:name/run` | Déclencher un balayage sans attendre son passage. `202`. Noms : `tasks.materialize`, `tasks.markMissed` |

```json
[
  {
    "id": "...",
    "email": "marie@example.com",
    "displayName": "Marie",
    "isServerAdmin": true,
    "householdCount": 1,
    "createdAt": "2026-10-24T18:00:00Z",
    "deletedAt": null
  }
]
```

Ce n'est pas une exclusion déguisée : le compte disparaît de l'instance entière, il
n'est pas retiré d'un foyer. Si le dernier administrateur supprime son compte, le
compte actif le plus ancien devient administrateur.

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
