# Modèle de données

Ce document est la source de vérité du domaine. Toute évolution de l'API ou du
schéma de base part d'ici.

Conventions :

- Toutes les clés primaires sont des **UUID v7** (triables par date de création), et
  sont **générées par le client** quand c'est possible — c'est ce qui rend les
  créations idempotentes et le mode hors-ligne réalisable (voir [`sync.md`](sync.md)).
- Tous les instants sont stockés en **UTC** (`timestamptz`). L'affichage se fait dans
  le fuseau du foyer.
- Toute table synchronisée porte `createdAt`, `updatedAt` et `deletedAt` (suppression
  logique, nécessaire pour propager les suppressions aux clients hors-ligne).
- `householdId` est présent sur toutes les tables métier : c'est la frontière
  d'isolation, vérifiée dans une garde unique côté serveur.
- En base, **les tables sont en `snake_case` et les colonnes en `camelCase`**
  (`task_occurrence.taskDefinitionId`). C'est la convention Prisma ; en SQL manuel,
  les noms de colonnes doivent donc être entre guillemets doubles.

## Vue d'ensemble

```
Household ──┬── HouseholdMember ──── User ──┬── CalendarAccount ─── ExternalEvent
            │                               └── Device
            ├── TaskDefinition ──── TaskOccurrence
            ├── CounterDefinition ─── CounterEvent
            ├── Appointment ──── AppointmentAttendee
            ├── Invite
            └── ActivityLog
```

---

## Identité et foyer

### User

Un compte sur **cette** instance. Il n'y a pas d'annuaire central : un utilisateur
est local au serveur auto-hébergé.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `email` | text unique | Identifiant de connexion, normalisé en minuscules côté serveur |
| `displayName` | text | Nom affiché dans le foyer |
| `passwordHash` | text | Argon2id |
| `isServerAdmin` | bool | Administrateur de l'**instance**, distinct du rôle dans un foyer |
| `avatarColor` | text | Couleur générée, évite d'avoir à héberger des images en v1 |
| `locale` | text | `fr-FR` par défaut |
| `timezone` | text | IANA, hérité du foyer si absent |
| `createdAt` / `updatedAt` | timestamptz | |

Un utilisateur peut appartenir à **plusieurs** foyers (colocation + famille, garde
alternée). L'app mobile impose donc un sélecteur de foyer, même s'il n'y en a qu'un.

### Household

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | « Maison des Dupont » |
| `timezone` | text | IANA. **Référence** pour calculer les échéances |
| `weekStartsOn` | int | 1 = lundi |
| `createdAt` / `updatedAt` | timestamptz | |

Le fuseau du foyer est structurant : « chaque lundi à 19h » doit rester 19h locales
même après un changement d'heure, donc les occurrences sont calculées en heure locale
puis converties en UTC — jamais l'inverse.

### HouseholdMember

Table de liaison portant le rôle.

| Champ | Type | Notes |
|---|---|---|
| `householdId` / `userId` | uuid | Clé primaire composite |
| `role` | enum | `OWNER` \| `ADULT` \| `CHILD` \| `GUEST` |
| `nickname` | text? | Surnom propre à ce foyer |
| `joinedAt` | timestamptz | |

Permissions par rôle :

| Action | OWNER | ADULT | CHILD | GUEST |
|---|---|---|---|---|
| Lire le contenu du foyer | ✅ | ✅ | ✅ | ✅ |
| Compléter une tâche / un compteur assigné | ✅ | ✅ | ✅ | ❌ |
| Créer / modifier tâches, compteurs, rdv | ✅ | ✅ | ❌ | ❌ |
| Inviter, changer les rôles | ✅ | ❌ | ❌ | ❌ |
| Supprimer le foyer | ✅ | ❌ | ❌ | ❌ |

**Personne ne peut sortir quelqu'un d'autre d'un foyer.** Il n'y a pas d'exclusion
dans ce modèle : un propriétaire change des rôles et invite, il n'exclut pas. La
seule sortie est la suppression du compte, décrite ci-dessous.

Un foyer garde **toujours au moins un `OWNER`** : le dernier propriétaire ne peut ni
partir ni se rétrograder sans transmettre le rôle, sinon plus personne ne peut
inviter ni gérer les rôles et le foyer est définitivement bloqué.

La règle est appliquée **côté serveur** (`HouseholdsService`, erreur `LAST_OWNER`,
HTTP 409), pas par une contrainte PostgreSQL : l'exprimer en base demanderait un
déclencheur, et le faire correctement avec des suppressions logiques est délicat. La
conséquence à connaître : une écriture directe en base peut contourner la règle. Un
déclencheur reste une piste de durcissement.

### Invite

Rejoindre un foyer passe par un code à usage limité, jamais par une recherche
d'utilisateur (un serveur familial n'a pas à être un annuaire).

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `householdId` | uuid | |
| `code` | text unique | 8 caractères, alphabet sans ambiguïté (pas de `0`/`O`/`1`/`l`) |
| `role` | enum | Rôle attribué à l'arrivée |
| `maxUses` / `useCount` | int | |
| `expiresAt` | timestamptz | 7 jours par défaut |
| `createdBy` | uuid | |

---

## Suppression de compte

C'est la seule façon de sortir d'un foyer. Il n'y a ni départ volontaire ni
exclusion : un foyer n'est pas un groupe qu'on quitte, c'est un lieu où l'on vit.

Qui peut supprimer un compte :

- **son titulaire**, toujours ;
- **un administrateur de l'instance** (`User.isServerAdmin`), pour un compte dont le
  titulaire n'est plus joignable. Ce rôle est au niveau du serveur et n'a rien à voir
  avec `OWNER` dans un foyer : le propriétaire d'un foyer n'administre pas l'instance.

Le premier compte créé sur un serveur neuf devient administrateur : sans cela, une
instance où plus personne ne répond n'est plus administrable.

Dans les deux cas, le **mot de passe de l'appelant** est exigé : une suppression est
irréversible, une session volée ne doit pas suffire.

### Anonymisation plutôt qu'effacement

La ligne `user` est conservée, vidée de toute donnée personnelle :

| Champ | Devient |
|---|---|
| `email` | `supprime+<id>@invalide.local` — unique, inutilisable pour se connecter |
| `displayName` | `Ancien membre` |
| `passwordHash` | 32 octets aléatoires : pas une empreinte Argon2 valide, donc aucune vérification ne peut réussir |
| `timezone`, `isServerAdmin` | `null` / `false` |
| `deletedAt` | maintenant |

Sont **supprimées pour de bon**, car elles ne portent aucun historique utile au foyer
mais des secrets qui n'ont plus de raison d'exister : `refresh_token`, `device`,
`calendar_account`, `notification_preference`, `reminder`. Les invitations émises par
ce compte sont révoquées.

Pourquoi ne pas tout effacer : les tâches faites et les compteurs remis à zéro
resteraient sans auteur, et les totaux du foyer changeraient rétroactivement. Garder
le nom, à l'inverse, conserverait une donnée personnelle de quelqu'un qui a demandé
son effacement. L'anonymisation garde l'historique cohérent — « Ancien membre a sorti
les poubelles » — sans garder l'identité.

### Une suppression ne peut pas être refusée

Elle n'échoue jamais pour une raison d'organisation : c'est un droit, pas une faveur.
Si le compte est le dernier propriétaire d'un foyer, la propriété est transmise au
**membre le plus ancien parmi les adultes**, à défaut au plus ancien des enfants. Les
invités sont écartés : un invité n'a pas vocation à administrer un foyer.

Sans aucun candidat — le compte était seul dans le foyer — le **foyer est supprimé**
avec lui.

Même logique au niveau de l'instance : si le dernier administrateur supprime son
compte, le compte actif le plus ancien le devient. Une instance sans administrateur
ne serait plus administrable.

---

## Tâches récurrentes

Deux niveaux, et c'est le cœur du modèle : la **définition** (la règle) et
l'**occurrence** (une instance datée, complétable).

### TaskDefinition

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `householdId` | uuid | |
| `title` | text | « Sortir les poubelles » |
| `description` | text? | |
| `category` | text? | Libre : `cuisine`, `animaux`… |
| `rrule` | text | RRULE RFC 5545, ex. `FREQ=WEEKLY;BYDAY=MO` |
| `dueTime` | time? | Heure locale d'échéance. `null` = toute la journée |
| `durationMinutes` | int? | Estimation, sert à l'équilibrage de charge |
| `assignmentMode` | enum | `FIXED` \| `ROTATION` \| `ANYONE` |
| `graceHours` | int | Délai après échéance avant de passer en `MISSED` (24 par défaut) |
| `points` | int | Poids pour les statistiques d'équité |
| `isActive` | bool | Mettre en pause sans supprimer l'historique |
| `rotationCursor` | int | Position courante du tour de rôle |
| `startsOn` / `endsOn` | date? | Bornes de la règle |
| `createdBy` | uuid | |

Modes d'assignation :

- **`FIXED`** — toujours les mêmes personnes (`TaskAssignee`).
- **`ROTATION`** — tour de rôle dans l'ordre de `TaskAssignee.position`. La
  rotation avance à la **génération** de l'occurrence, pas à sa complétion : sinon
  une tâche oubliée bloquerait le tour de tout le monde.
- **`ANYONE`** — non assignée, le premier qui la fait la prend.

### TaskAssignee

| Champ | Type | Notes |
|---|---|---|
| `taskDefinitionId` / `userId` | uuid | Clé composite |
| `position` | int | Ordre de rotation |

### TaskOccurrence

Instances matérialisées en base, pas calculées à la volée. C'est ce qui permet
d'assigner, de commenter, de reporter et de garder un historique fiable même si la
règle change ensuite.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `taskDefinitionId` | uuid | |
| `householdId` | uuid | Dupliqué pour pouvoir filtrer sans jointure |
| `scheduledFor` | date | Jour d'échéance en heure locale du foyer |
| `dueAt` | timestamptz | Instant calculé depuis `scheduledFor` + `dueTime` |
| `assigneeId` | uuid? | `null` si `ANYONE` |
| `status` | enum | `PENDING` \| `DONE` \| `SKIPPED` \| `MISSED` |
| `completedAt` | timestamptz? | |
| `completedBy` | uuid? | Peut différer de l'assigné — quelqu'un a dépanné |
| `note` | text? | |

**Contrainte unique : `(taskDefinitionId, scheduledFor)`.** C'est elle qui rend le job
de génération idempotent et rejouable sans danger.

Règles métier :

- Un job quotidien matérialise les occurrences sur une **fenêtre glissante de 60
  jours**. Horizon borné pour ne pas générer l'infini sur une règle sans `endsOn`.
- `MISSED` est posé par un job sur les occurrences `PENDING` dépassant
  `dueAt + graceHours`. Ce n'est pas calculé à l'affichage : on veut l'instant exact
  du constat dans l'historique.
- Modifier une `TaskDefinition` **ne réécrit pas le passé** : seules les occurrences
  futures encore `PENDING` sont regénérées.
- Supprimer une définition conserve les occurrences `DONE` (statistiques), les
  `PENDING` futures sont supprimées logiquement.

---

## Compteurs de temps

Le besoin : « une action qui enclenche un compteur, remis à zéro en accomplissant à
nouveau l'action ». Modélisé comme un **journal d'événements** plutôt qu'un champ
`lastResetAt` modifiable — on garde l'historique, on peut annuler, et deux clients
hors-ligne ne s'écrasent pas mutuellement.

### CounterDefinition

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `householdId` | uuid | |
| `title` | text | « Changer les draps » |
| `description` | text? | |
| `category` | text? | |
| `targetIntervalSeconds` | int? | Ex. `1209600` (14 jours). `null` = compteur purement informatif |
| `warnRatio` | numeric | 0.8 par défaut : prévenir à 80 % de l'intervalle |
| `assignmentMode` | enum | `ANYONE` \| `FIXED` \| `ROTATION` |
| `isActive` | bool | |
| `createdBy` | uuid | |

### CounterEvent

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `counterDefinitionId` | uuid | |
| `householdId` | uuid | |
| `occurredAt` | timestamptz | **Quand l'action a été faite**, pas quand elle a été saisie |
| `recordedBy` | uuid | |
| `note` | text? | |

`occurredAt` est distinct de `createdAt` : on doit pouvoir déclarer dimanche soir une
action faite samedi matin, et la saisie hors-ligne est datée à l'action, pas au
moment où le réseau revient.

État dérivé (jamais stocké, toujours calculé) :

```
lastEvent    = max(occurredAt) des événements non supprimés
elapsed      = now - lastEvent
status       = NEVER_DONE        si aucun événement
               OK                si elapsed < targetIntervalSeconds * warnRatio
               DUE_SOON          si elapsed < targetIntervalSeconds
               OVERDUE           sinon
nextDueAt    = lastEvent + targetIntervalSeconds
```

Pourquoi calculer et ne pas stocker : un événement peut être ajouté *dans le passé*
ou supprimé, ce qui invaliderait n'importe quel champ dérivé mis en cache. Le coût
est négligeable (un `max()` sur un index `(counterDefinitionId, occurredAt DESC)`).

---

## Rendez-vous

### Appointment

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `householdId` | uuid | |
| `title` | text | |
| `description` | text? | |
| `location` | text? | |
| `startAt` / `endAt` | timestamptz | |
| `isAllDay` | bool | Si vrai, `startAt` est minuit dans le fuseau du foyer |
| `rrule` | text? | Rendez-vous récurrents |
| `visibility` | enum | `HOUSEHOLD` (visible par tous) \| `PRIVATE` (créateur + invités) |
| `source` | enum | `LOCAL` \| `IMPORTED` |
| `calendarAccountId` | uuid? | Renseigné si importé |
| `externalUid` | text? | UID iCalendar de l'événement source |
| `createdBy` | uuid | |

Les événements importés d'un agenda externe sont **en lecture seule** côté MyHousehold
en v1 : l'écriture bidirectionnelle est un sujet à part entière (voir
[`calendar-sync.md`](calendar-sync.md)).

### AppointmentAttendee

| Champ | Type | Notes |
|---|---|---|
| `appointmentId` / `userId` | uuid | Clé composite |
| `response` | enum | `NEEDS_ACTION` \| `ACCEPTED` \| `DECLINED` \| `TENTATIVE` |

### Reminder

Rappels, communs aux tâches et aux rendez-vous.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `targetType` | enum | `APPOINTMENT` \| `TASK_OCCURRENCE` \| `COUNTER` |
| `targetId` | uuid | |
| `offsetMinutes` | int | Négatif = avant l'échéance |
| `userId` | uuid? | `null` = tous les membres concernés |
| `sentAt` | timestamptz? | Garde-fou anti-doublon |

---

## Synchronisation d'agenda

### CalendarAccount

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | uuid | Un agenda appartient à **une personne**, pas au foyer |
| `provider` | enum | `GOOGLE` \| `CALDAV` \| `ICS_URL` |
| `displayName` | text | |
| `credentials` | bytea | **Chiffré** (AES-256-GCM, clé depuis `MH_ENCRYPTION_KEY`) |
| `syncDirection` | enum | `PULL` \| `PUSH` \| `BOTH` (seul `PULL` en v1) |
| `defaultVisibility` | enum | Visibilité appliquée aux événements importés |
| `busyOnly` | bool | Si vrai, n'importe que la plage horaire sans le titre |
| `syncCursor` | text? | `syncToken` Google, `ctag` CalDAV, `ETag` ICS |
| `lastSyncAt` / `lastErrorAt` | timestamptz? | |
| `lastError` | text? | |
| `isActive` | bool | |

`busyOnly` est important pour l'acceptabilité : partager ses disponibilités avec son
foyer ne doit pas obliger à partager le contenu de son agenda professionnel.

### ExternalEvent

Table de correspondance entre un événement distant et son `Appointment` local.

| Champ | Type | Notes |
|---|---|---|
| `calendarAccountId` / `externalUid` | — | Clé composite |
| `appointmentId` | uuid | |
| `etag` | text? | Permet de ne retoucher que ce qui a changé |
| `lastSeenAt` | timestamptz | Un événement non revu après une synchro complète est supprimé |

---

## Technique

### Device

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | uuid | |
| `pushToken` | text? | FCM ou endpoint UnifiedPush |
| `pushProvider` | enum | `FCM` \| `UNIFIEDPUSH` \| `NONE` |
| `platform` / `appVersion` | text | |
| `lastSeenAt` | timestamptz | |

UnifiedPush est prévu dès le modèle : une app distribuée hors Play Store ne peut pas
dépendre uniquement de FCM.

### RefreshToken

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` / `deviceId` | uuid | |
| `tokenHash` | text | SHA-256 — le token en clair n'est jamais stocké |
| `expiresAt` | timestamptz | |
| `revokedAt` | timestamptz? | |
| `replacedById` | uuid? | Chaîne de rotation : détecte le rejeu d'un token volé |

### ActivityLog

Fil d'activité du foyer (« Marie a sorti les poubelles »). Dénormalisé exprès : il
doit rester lisible même après suppression de l'objet concerné. Le nom de l'auteur
n'est **pas** recopié dans `summary` : il est résolu depuis `user`, ce qui fait que
l'anonymisation d'un compte anonymise automatiquement tout son historique.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `householdId` / `actorId` | uuid | |
| `verb` | enum | `TASK_COMPLETED`, `COUNTER_RESET`, `MEMBER_JOINED`, `MEMBER_ACCOUNT_DELETED`, `OWNERSHIP_TRANSFERRED`… |
| `subjectType` / `subjectId` | — | |
| `summary` | text | Texte figé au moment de l'événement |
| `createdAt` | timestamptz | |

## Index

Créés par la migration initiale (`prisma/migrations/20261024180000_init`). Les noms
de colonnes sont entre guillemets parce qu'ils sont en `camelCase` :

```sql
-- l'écran « Aujourd'hui » du mobile
CREATE INDEX ON task_occurrence ("householdId", "scheduledFor", status);
CREATE INDEX ON task_occurrence ("assigneeId", status);
-- rend le job de matérialisation idempotent
CREATE UNIQUE INDEX ON task_occurrence ("taskDefinitionId", "scheduledFor");
-- dernier événement d'un compteur, en une lecture
CREATE INDEX ON counter_event ("counterDefinitionId", "occurredAt" DESC);
CREATE INDEX ON appointment ("householdId", "startAt", "endAt");
CREATE UNIQUE INDEX ON external_event ("calendarAccountId", "externalUid");
-- curseur de synchronisation du mobile, une entrée par table synchronisée
CREATE INDEX ON task_occurrence ("householdId", "updatedAt");
CREATE INDEX ON appointment ("householdId", "updatedAt");
```

## Tables techniques

Deux tables ne portent pas de données de foyer :

- **`processed_mutation`** — déduplication des mutations poussées par le mobile
  (`clientMutationId`, et la réponse renvoyée la première fois). Conservée 30 jours :
  c'est elle qui garantit l'idempotence quand une réponse se perd. Voir
  [`sync.md`](sync.md).
- **`refresh_token`** — jetons de rafraîchissement hachés, avec leur chaîne de
  rotation (`replacedById`) qui détecte le rejeu d'un jeton volé.

## Questions ouvertes

1. **Équité des rotations** — faut-il pondérer par `points` pour rééquilibrer sur le
   mois, ou garder un tour de rôle strict et prévisible ? Le strict est plus simple à
   comprendre pour les utilisateurs, donc retenu en v1.
2. **Tâches des enfants** — faut-il une validation par un adulte avant de passer
   `DONE` ? Repoussé en v2, mais `completedBy` distinct de `assigneeId` prépare déjà
   le terrain.
3. **Multi-foyer et vie privée** — si un utilisateur est dans deux foyers, un agenda
   synchronisé doit-il alimenter les deux ? Décision actuelle : oui par défaut, car
   les disponibilités de la personne sont les mêmes partout.
4. **Multi-foyer et sortie** — comme la seule sortie est la suppression du compte,
   quelqu'un qui appartient à une famille *et* à une colocation ne peut pas quitter
   la colocation sans perdre son compte entier. Acceptable tant que le cas d'usage
   dominant est un foyer unique ; à revoir si le multi-foyer devient courant.
