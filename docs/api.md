# Contrat d'API REST

Base : `/api/v1` · `Content-Type: application/json` · UTF-8

Ce document est le contrat entre le serveur et l'app Android. Toute modification
cassante passe par une nouvelle version de préfixe (`/api/v2`), jamais par une
mutation silencieuse de `v1`.

**État d'implémentation** (v0.1) : les sections *Authentification*, *Foyers*,
*Compte* et *Administration de l'instance* sont implémentées et couvertes par
`scripts/smoke.sh`. Tout le reste — tâches, compteurs,
rendez-vous, agendas, synchronisation, notifications, activité — est **spécifié mais
pas encore écrit** ; c'est le périmètre des v0.2 et v0.3 de
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

## Tâches *(à venir — v0.2)*

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/tasks` | Définitions. `?isActive=true` |
| `POST` | `/tasks` | Création (rôle `ADULT`+) |
| `GET` | `/tasks/:id` | Définition + 10 prochaines occurrences |
| `PATCH` | `/tasks/:id` | Modifie la règle ; regénère les occurrences futures `PENDING` |
| `DELETE` | `/tasks/:id` | Suppression logique ; conserve l'historique `DONE` |
| `GET` | `/occurrences` | **L'endpoint principal de l'app** |
| `POST` | `/occurrences/:id/complete` | Marque faite |
| `POST` | `/occurrences/:id/uncomplete` | Annule (fenêtre de 48 h) |
| `POST` | `/occurrences/:id/skip` | Passe son tour avec un motif |
| `PATCH` | `/occurrences/:id` | Réassigner, reporter (`dueAt`), annoter |

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

`GET /occurrences?from=2026-10-24&to=2026-10-31&assigneeId=me&status=PENDING` :

```json
{
  "data": [
    {
      "id": "...",
      "taskDefinitionId": "...",
      "title": "Sortir les poubelles",
      "scheduledFor": "2026-10-27",
      "dueAt": "2026-10-27T18:00:00Z",
      "assignee": { "id": "...", "displayName": "Paul" },
      "status": "PENDING",
      "points": 2
    }
  ],
  "nextCursor": null
}
```

`title` est dupliqué depuis la définition : l'app affiche une liste sans avoir à
résoudre les définitions, et un client hors-ligne reste lisible.

`POST /occurrences/:id/complete` accepte `{ "completedAt": "...", "note": "..." }` —
`completedAt` est optionnel et sert à déclarer une action faite plus tôt. Rejeu sur
une occurrence déjà `DONE` : `409 TASK_ALREADY_COMPLETED` (sauf si c'est le même
utilisateur avec le même instant, auquel cas `200` — tolérance au rejeu réseau).

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
