# Modèle de données

Ce document est la source de vérité du domaine. Toute évolution de l'API ou du
schéma de base part d'ici.

> ⚠️ **Révision en cours.** Ce document décrit le modèle **décidé**, qui n'est pas
> encore celui du code : le serveur implémente encore le modèle précédent
> (compteurs séparés, foyers multiples, points). La reprise est en cours ; voir
> [`roadmap.md`](roadmap.md).

## Un serveur, un foyer

MyHousehold est auto-hébergé : **une machine sert un seul foyer**. Il n'y a ni
multi-foyer, ni notion d'instance partagée.

Cela retire beaucoup de complexité : pas de frontière d'isolation à défendre entre
foyers, pas de sélecteur de foyer dans l'app, pas de rôle « administrateur de
l'instance » distinct du foyer. Qui administre le serveur administre le foyer.

Conventions :

- Clés primaires en **UUID v7**, **générées par le client** quand c'est possible —
  c'est ce qui rend les créations idempotentes et le mode hors-ligne réalisable
  (voir [`sync.md`](sync.md)).
- Instants en **UTC** (`timestamptz`), affichés dans le fuseau du foyer.
- `createdAt`, `updatedAt`, `deletedAt` sur toute table synchronisée : la
  suppression est logique, sinon un client hors-ligne ne peut pas apprendre qu'un
  objet a disparu.
- Tables en `snake_case`, colonnes en `camelCase` (convention Prisma) : en SQL
  manuel, les colonnes se mettent entre guillemets doubles.

## Vue d'ensemble

```
Household (une seule ligne)
   │
   ├── Status ──────── User ──┬── CalendarAccount ─── ExternalEvent
   │                          ├── Device
   │                          └── Avatar
   ├── TaskGroup ─── Task ──── TaskOccurrence
   ├── Appointment ─── AppointmentAttendee
   ├── Invite
   └── ActivityLog
```

---

## Le foyer

### Household

Une seule ligne, créée par l'assistant d'installation.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | « Maison des Dupont » |
| `timezone` | text | IANA. **Référence** pour calculer les échéances |
| `weekStartsOn` | int | 1 = lundi |

Le fuseau du foyer est structurant : « chaque lundi à 19 h » doit rester 19 h locales
après un changement d'heure, donc les occurrences sont calculées en heure locale puis
converties en UTC — jamais l'inverse.

---

## Comptes et statuts

### User

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `email` | text unique | Identifiant de connexion, normalisé en minuscules |
| `firstName` | text | Prénom |
| `lastName` | text | Nom |
| `birthDate` | date? | Date de naissance |
| `avatarPath` | text? | Photo de profil, stockée hors base |
| `passwordHash` | text | Argon2id |
| `statusId` | uuid | Son statut, donc ses droits |
| `locale` / `timezone` | text? | Hérités du foyer si absents |

Le nom affiché est dérivé du prénom et du nom ; l'app n'a pas à stocker un troisième
champ qui finirait par diverger.

La **photo de profil** est un fichier, pas une colonne : les images n'ont rien à faire
dans une base que l'on sauvegarde par `pg_dump`. Elles vivent dans le volume de
données, à côté, et la sauvegarde doit prendre les deux — c'est dit dans
[`self-hosting.md`](self-hosting.md).

### Status

**Les statuts et leurs droits se configurent uniquement depuis l'interface web du
serveur.** L'app les affiche, ne les modifie pas : un réglage qui engage la sécurité
du foyer se fait assis, sur un vrai écran, pas au pouce entre deux portes.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | « Administrateur », « Adulte », « Enfant », « Invité » |
| `rights` | text[] | Liste de droits, ci-dessous |
| `isDefault` | bool | Statut donné aux nouveaux membres |
| `position` | int | Ordre d'affichage |

Droits :

| Droit | Permet |
|---|---|
| `VIEW` | Voir le contenu du foyer |
| `COMPLETE_TASKS` | Cocher une tâche, faire une tâche de fond |
| `MANAGE_TASKS` | Créer, modifier, supprimer tâches et groupes |
| `MANAGE_APPOINTMENTS` | Créer et modifier des rendez-vous |
| `MANAGE_MEMBERS` | Inviter, changer le statut d'un membre |
| `MANAGE_STATUSES` | Créer et modifier les statuts eux-mêmes |
| `MANAGE_SERVER` | Mises à jour, sauvegardes, suppression de comptes |

Quatre statuts sont créés à l'installation — Administrateur (tous les droits),
Adulte, Enfant, Invité — et restent modifiables comme les autres.

**Au moins un compte garde `MANAGE_STATUSES` et `MANAGE_SERVER`.** Sans cela, plus
personne ne peut administrer le foyer et il est définitivement bloqué. La règle est
vérifiée côté serveur, au changement de statut comme à la suppression d'un compte.

### Invite

On rejoint le foyer par un code, jamais par une recherche d'utilisateur : un serveur
familial n'a pas à être un annuaire.

| Champ | Type | Notes |
|---|---|---|
| `code` | text unique | 8 caractères, sans `0`/`O`/`1`/`l` |
| `statusId` | uuid | Statut attribué à l'arrivée |
| `maxUses` / `useCount` | int | |
| `expiresAt` | timestamptz | 7 jours par défaut |

---

## Tâches

**Tout est une tâche.** Ce qui change d'une tâche à l'autre, c'est *quand* elle est
due — et c'est le seul axe qui compte pour l'organisation d'un foyer.

### Les trois façons d'être due

| Type | Échéance | Exemple |
|---|---|---|
| `SCHEDULED` | À une date, selon une récurrence | Sortir les poubelles chaque lundi |
| `BACKGROUND` | À refaire **dans un délai**, pas à une date | Changer les draps dans les 14 jours |
| `ONE_OFF` | Une seule fois, avec ou sans date limite | Remplacer l'ampoule de la salle de bain |

Les **tâches de fond** (`BACKGROUND`) remplacent ce que la version précédente
appelait des « compteurs ». Ce n'était pas une autre nature d'objet : c'est une tâche
dont l'impact dure, et qu'il faut refaire dans un temps imparti plutôt qu'à une date
fixe. Les appeler autrement créait deux listes là où le foyer n'en vit qu'une.

### Task

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` | text | |
| `description` | text? | |
| `kind` | enum | `SCHEDULED` \| `BACKGROUND` \| `ONE_OFF` |
| `groupId` | uuid? | Groupe de tâches, facultatif |
| `priority` | int | De +3 à −3, voir ci-dessous |
| `assignmentMode` | enum | `FIXED` \| `ROTATION` \| `ANYONE` |
| `isActive` | bool | Mettre en pause sans perdre l'historique |
| `createdById` | uuid | |

Selon le type :

| Champ | S'applique à | Notes |
|---|---|---|
| `recurrence` | `SCHEDULED` | Voir *Récurrences* |
| `dueTime` | `SCHEDULED` | Heure locale. Absente = toute la journée |
| `graceHours` | `SCHEDULED` | Délai avant de marquer manquée (24 par défaut) |
| `maxIntervalSeconds` | `BACKGROUND` | Délai maximum entre deux fois |
| `warnRatio` | `BACKGROUND` | Fraction du délai à partir de laquelle on prévient (0,8) |
| `dueDate` | `ONE_OFF` | Date limite, facultative |

### Récurrences

Une tâche `SCHEDULED` se répète de cinq façons, et pas davantage : ce sont celles
qu'un foyer formule spontanément.

| Forme | Exemple |
|---|---|
| Chaque jour, tous les N jours | Vider le lave-vaisselle |
| Jours choisis de la semaine | Poubelles le lundi et le jeudi |
| Dates choisies du mois | Loyer le 1er, relevé le 15 |
| Dates choisies de l'année | Entretien chaudière le 15 septembre |
| Toutes les N semaines / N mois | Grand ménage toutes les 3 semaines |

Stockées en **RRULE RFC 5545** — un standard, déjà compris par le moteur du serveur
et par les agendas. L'interface ne montre jamais la règle brute : elle propose ces
cinq formes et affiche les trois prochaines dates, parce que personne ne vérifie une
règle dans l'abstrait alors que tout le monde vérifie trois dates.

### Priorités

Sept niveaux, centrés sur « normale ». Stockés en entier signé, ce qui rend le tri
évident et permet d'ajouter des niveaux sans migration de données.

| Valeur | Libellé |
|---|---|
| `+3` | Urgente |
| `+2` | Très haute |
| `+1` | Haute |
| `0` | Normale |
| `−1` | Basse |
| `−2` | Très basse |
| `−3` | En dernier |

Une priorité **négative** n'est pas une tâche sans importance : c'est une tâche qui
cède le passage. C'est ce qui permet de garder dans la liste ce qui traîne depuis des
mois sans que cela noie ce qui compte aujourd'hui.

### TaskGroup

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | « Cuisine », « Voiture », « Avant les vacances » |
| `color` | text | Pour la lecture en liste |
| `position` | int | |

Un groupe rassemble des tâches qui vont ensemble. Une tâche appartient **à un groupe
au plus** : les appartenances multiples transforment une liste de corvées en système
de classement, et personne ne range ses corvées.

### TaskOccurrence

Les occurrences sont matérialisées en base, pas déroulées à la lecture : une
occurrence s'assigne, s'annote, se reporte, et un client hors-ligne doit pouvoir la
porter.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `taskId` | uuid | |
| `scheduledFor` | date? | Jour d'échéance, en heure locale. Absent pour une tâche de fond |
| `dueAt` | timestamptz? | Instant d'échéance |
| `assigneeId` | uuid? | |
| `status` | enum | `PENDING` \| `DONE` \| `SKIPPED` \| `MISSED` |
| `completedAt` | timestamptz? | **Quand l'action a été faite**, pas quand elle a été saisie |
| `completedById` | uuid? | Peut différer de l'assigné : quelqu'un a dépanné |
| `note` | text? | |

Règles communes :

- `(taskId, scheduledFor)` est unique : c'est ce qui rend la génération idempotente.
- Un job horaire matérialise les occurrences de −14 à +60 jours. Le passé est
  rattrapé au cas où le serveur est resté éteint.
- Modifier une tâche **ne réécrit pas le passé** : seules les occurrences futures
  encore `PENDING` sont regénérées.

Pour une tâche **de fond**, chaque complétion crée une occurrence `DONE` datée — c'est
le journal qui faisait l'intérêt des anciens compteurs, et il est conservé :

```
derniereFois  = max(completedAt) des occurrences faites
ecoule        = maintenant − derniereFois
etat          = JAMAIS_FAITE   si aucune
                OK             si ecoule < maxIntervalSeconds × warnRatio
                BIENTOT        si ecoule < maxIntervalSeconds
                EN_RETARD      sinon
prochaineFois = derniereFois + maxIntervalSeconds
```

Rien de cet état n'est stocké : une complétion peut être déclarée dans le passé ou
corrigée, ce qui invaliderait n'importe quel champ mis en cache. Le coût est un
`max()` sur un index.

### Plus de points

Le système de points est retiré. Compter les corvées en points suppose qu'on sache
ce que vaut une vaisselle face à une lessive, et transforme une organisation en
comptabilité. Les contributions se mesurent en **nombre de tâches faites**, sans
classement.

---

## Rendez-vous

### Appointment

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` / `description` / `location` | text | |
| `startAt` / `endAt` | timestamptz | |
| `isAllDay` | bool | |
| `rrule` | text? | Récurrence, déroulée à la lecture |
| `visibility` | enum | `HOUSEHOLD` \| `PRIVATE` |
| `source` | enum | `LOCAL` \| `IMPORTED` (lecture seule) |

Les récurrences ne sont pas matérialisées, contrairement aux tâches : un rendez-vous
ne s'assigne pas et ne se complète pas, il n'y a rien à y accrocher.

### AppointmentAttendee

`(appointmentId, userId)`, avec `response` : `NEEDS_ACTION`, `ACCEPTED`, `DECLINED`,
`TENTATIVE`. On ne répond que pour soi.

---

## Agendas externes

### CalendarAccount

**Chaque compte peut lier son agenda externe.** Il appartient à la personne, pas au
foyer : elle en garde le contrôle et peut le retirer à tout moment.

| Champ | Type | Notes |
|---|---|---|
| `userId` | uuid | |
| `provider` | enum | `GOOGLE` \| `CALDAV` \| `ICS_URL` |
| `credentials` | bytea | **Chiffré** (AES-256-GCM, clé hors base) |
| `busyOnly` | bool | N'importe que la plage, sans le titre. **Vrai par défaut** |
| `syncCursor` / `lastSyncAt` / `lastError` | | Synchronisation incrémentale |

`busyOnly` par défaut parce que partager ses disponibilités avec son foyer ne doit pas
obliger à partager le contenu de son agenda professionnel.

### ExternalEvent

Correspondance `(calendarAccountId, externalUid)` → `appointmentId`, avec `etag` pour
ne retoucher que ce qui a changé.

---

## Technique

- **Device** — appareils et jetons de notification (FCM ou UnifiedPush).
- **RefreshToken** — jetons hachés, chaîne de rotation détectant le rejeu.
- **NotificationPreference** — canaux et heures de silence, par compte.
- **ActivityLog** — fil du foyer. Texte figé à l'écriture, mais **sans recopier le nom
  de l'auteur** : il est résolu depuis la table des comptes, ce qui fait qu'anonymiser
  un compte supprimé anonymise tout son historique d'un coup.
- **ProcessedMutation** — déduplication des mutations poussées par le mobile.
- **ServerSetup**, **SetupPairing**, **ReleaseCheck** — installation et mises à jour.

## Suppression de compte

Inchangée, et c'est toujours la seule sortie du foyer : il n'y a ni exclusion ni
départ volontaire. Le compte est **anonymisé** plutôt qu'effacé, pour que l'historique
du foyer garde un auteur sans garder une identité.

La règle du dernier administrateur remplace celle du dernier propriétaire : si le
compte supprimé est le seul à porter `MANAGE_SERVER`, le droit passe au compte actif
le plus ancien. Une suppression ne peut pas être refusée pour une raison
d'organisation.

## Questions ouvertes

1. **Taille des photos de profil** — redimensionner à l'arrivée (un téléphone envoie
   4 Mo pour un avatar de 96 px) et ne garder qu'une seule taille ? Probablement oui,
   sous peine de remplir la carte SD d'un Raspberry Pi.
2. **Tâches de fond et assignation** — un tour de rôle a-t-il du sens sans date ?
   Proposition : seulement `ANYONE` et `FIXED` pour ce type, le tour de rôle supposant
   une suite d'échéances.
3. **Groupes et récurrence commune** — faut-il pouvoir donner une récurrence au groupe
   entier (« tout le ménage du samedi ») ? Repoussé : un groupe est un classement, pas
   une méta-tâche.
