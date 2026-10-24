# Architecture du serveur

## Contexte

```
┌─────────────────┐        HTTPS/REST        ┌──────────────────────────┐
│  App Android    │ ───────────────────────► │  Serveur MyHousehold     │
│  (hors-ligne    │ ◄─────────────────────── │  NestJS + PostgreSQL     │
│   d'abord)      │     push (FCM/UP)        └────────────┬─────────────┘
└─────────────────┘                                       │
                                                          │ OAuth / CalDAV / HTTP
                                          ┌───────────────▼────────────────┐
                                          │ Google Calendar, Nextcloud,    │
                                          │ Outlook, flux ICS…             │
                                          └────────────────────────────────┘
```

Une instance = un ou plusieurs foyers, hébergée par un particulier. Dimensionnement
cible : **10 utilisateurs, 50 tâches, 5 agendas**. Toutes les décisions ci-dessous
privilégient la simplicité d'exploitation sur la capacité à monter en charge.

## Modules NestJS

| Module | Responsabilité |
|---|---|
| `auth` | Inscription, connexion, rotation des refresh tokens, gardes |
| `users` | Profil, préférences, appareils |
| `households` | Foyers, membres, rôles, invitations |
| `tasks` | Définitions, assignation, occurrences, complétion |
| `counters` | Définitions et événements de remise à zéro |
| `appointments` | Rendez-vous et participants |
| `calendar` | Comptes externes, adaptateurs de synchronisation |
| `sync` | Endpoint de delta pour le client mobile |
| `notifications` | Rappels, échéances, envoi push |
| `scheduler` | Jobs BullMQ (génération, retards, synchro, rappels) |
| `activity` | Fil d'activité du foyer |

Chaque module expose un `Service` (métier, testable sans HTTP) et un `Controller`
(validation et transport). La règle : **aucune logique métier dans un contrôleur**.

## Isolation des foyers

Tout l'enjeu de sécurité est là : un membre du foyer A ne doit jamais atteindre une
donnée du foyer B.

1. Le JWT porte `sub` (userId), **pas** la liste des foyers — elle changerait sans
   que le token expire.
2. Un `HouseholdMemberGuard` résout l'appartenance à chaque requête (avec un cache
   de 30 s) et rejette en `404` — pas `403`, pour ne pas confirmer l'existence d'un
   foyer qu'on n'a pas le droit de voir.
3. Toute requête porte `householdId` dans sa clause `WHERE`, et un test
   d'intégration par endpoint vérifie l'isolation. C'est non négociable à la revue.

## Jobs planifiés

BullMQ + Redis. Tous les jobs sont **idempotents** et rejouables : c'est la
contrainte qui permet de les relancer après une coupure sans rien corrompre.

| Job | Fréquence | Rôle |
|---|---|---|
| `tasks.materialize` | 1×/h | Matérialise les occurrences sur 60 jours |
| `tasks.markMissed` | 15 min | Passe en `MISSED` au-delà du délai de grâce |
| `calendar.sync` | 15 min / compte | Synchronisation incrémentale des agendas |
| `notifications.dispatch` | 1 min | Envoie les rappels dus |
| `maintenance.purge` | 1×/j | Purge les tokens expirés et les suppressions logiques > 90 j |

Pourquoi des jobs plutôt que du calcul à la volée : les occurrences et les retards
sont des **faits** que l'on veut dans l'historique, et le mobile hors-ligne a besoin
d'un état stable à synchroniser, pas d'un résultat qui change à chaque lecture.

## Fuseaux horaires

La règle, qui évite 90 % des bugs de ce genre d'application :

> On calcule en heure locale du foyer, on stocke en UTC, on renvoie l'UTC **et** le
> fuseau utilisé.

« Chaque lundi à 19h » reste 19h locales de part et d'autre d'un changement d'heure.
Concrètement, `tasks.materialize` déroule la RRULE dans le fuseau du foyer
(bibliothèque `rrule` + `luxon`), puis convertit chaque échéance en instant UTC.

## Choix techniques et alternatives écartées

| Choix | Pourquoi | Écarté |
|---|---|---|
| **NestJS** | Structure imposée (modules, DI, pipes de validation) : un projet communautaire a besoin que le code de deux contributeurs se ressemble. | Express — trop libre, chaque contribution réinventerait l'organisation. |
| **PostgreSQL** | `timestamptz`, `interval`, contraintes d'exclusion, index partiels : le domaine est temporel, autant utiliser une base qui sait manipuler le temps. | SQLite — séduisant pour l'auto-hébergement, mais pas de type `interval` ni de vrai fuseau, et la concurrence des jobs devient un problème. |
| **Prisma** | Migrations versionnées et types générés depuis le schéma : moins de divergence entre le code et la base. | TypeORM — historiquement instable sur les migrations. |
| **Occurrences matérialisées** | Assignables, commentables, historisables ; et un client hors-ligne peut les porter. | Dérouler la RRULE à la lecture — impossible d'assigner ou de commenter une occurrence qui n'existe pas. |
| **Compteurs en journal d'événements** | Historique, annulation, pas d'écrasement entre deux clients. | Un champ `lastResetAt` — perd l'historique et se corrompt dès deux saisies hors-ligne concurrentes. |
| **JWT + refresh rotatif** | Pas d'état de session côté serveur, révocation possible appareil par appareil. | Sessions en base — lectures supplémentaires sur chaque requête d'un serveur modeste. |
| **Docker Compose** | Trois conteneurs, une commande, sauvegarde triviale. | Kubernetes — hors sujet pour un Raspberry Pi. |

## Sécurité

- Mots de passe en **Argon2id** (jamais bcrypt pour un nouveau projet).
- Identifiants d'agenda chiffrés en **AES-256-GCM**, clé hors base
  (`MH_ENCRYPTION_KEY`). Une fuite du dump SQL ne donne pas accès aux agendas.
- Limitation de débit sur `/auth/*` : 5 tentatives / 15 min / IP.
- Pas de secret dans les logs : un intercepteur masque `password`, `credentials`,
  `token`, `code`.
- CORS fermé par défaut — le client est une app mobile, pas un navigateur.
- Les erreurs renvoyées au client ne contiennent jamais de détail d'implémentation.

## Tests

| Niveau | Portée | Outil |
|---|---|---|
| Unitaire | Récurrence, calcul d'état des compteurs, rotation, fuseaux | Jest |
| Intégration | Un test d'isolation de foyer **par endpoint** | Jest + Testcontainers |
| Contrat | Les réponses respectent le schéma OpenAPI publié | Jest + validateur |

La logique temporelle se teste avec une horloge injectée, jamais avec `new Date()` en
dur : un test qui dépend de l'heure réelle d'exécution finit toujours par échouer un
dimanche à 2h du matin.
