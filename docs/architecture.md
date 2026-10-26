# Architecture du serveur

## Contexte

```
┌─────────────────┐        HTTPS/REST        ┌──────────────────────────┐
│  App Android    │ ───────────────────────► │  Serveur MyHousehold     │
│  (utilisable    │ ◄─────────────────────── │  NestJS + PostgreSQL     │
│   sans serveur) │     push (FCM/UP)        │  + interface web         │
└─────────────────┘                          └────────────┬─────────────┘
         ▲                                                │
         │  navigateur ──────────────────────────────────► │
         │  (installation, administration, usage)          │
                                                          │ OAuth / CalDAV / HTTP
                                          ┌───────────────▼────────────────┐
                                          │ Google Calendar, Nextcloud,    │
                                          │ Outlook, flux ICS…             │
                                          └────────────────────────────────┘
```

Une machine = **un seul foyer**, hébergée par un particulier. Il n'y a ni
multi-foyer, ni notion d'instance partagée : qui administre le serveur administre le
foyer. Dimensionnement cible : **10 utilisateurs, 50 tâches, 5 agendas**. Toutes les
décisions ci-dessous privilégient la simplicité d'exploitation sur la capacité à
monter en charge.

## Modules NestJS

« ✅ » = implémenté, « · » = spécifié, pas encore écrit. L'ancien module `counters` a
été absorbé par `tasks` : une tâche de fond est une tâche, pas un autre objet.

| Module | État | Responsabilité |
|---|---|---|
| `auth` | ✅ | Inscription, connexion, rotation des refresh tokens, gardes |
| `household` | ✅ | Le foyer, ses membres, ses invitations |
| `statuses` | ✅ | Statuts et droits, modifiables depuis l'interface web seulement |
| `users` | ✅ | Profil, photo, suppression de compte avec anonymisation |
| `admin` | ✅ | Administration du serveur : comptes, santé, balayages, mises à jour |
| `health` | ✅ | `/health` et `/version` |
| `tasks` | ✅ | Tâches des trois types, groupes, priorités, assignation, occurrences, complétion |
| `scheduler` | ✅ | Jobs BullMQ : matérialisation, passage en « manquée » |
| `appointments` | ✅ | Rendez-vous, participants, récurrences déroulées |
| `agenda` | ✅ | Vue fusionnée rendez-vous + tâches |
| `calendar` | · | Comptes externes, adaptateurs de synchronisation |
| `sync` | · | Endpoint de delta pour le client mobile |
| `notifications` | · | Rappels, échéances, envoi push |
| `activity` | ✅ | Fil d'activité du foyer |
| `setup` | · | Assistant d'installation ([setup-wizard.md](setup-wizard.md)) |
| `web` | · | Service de l'interface web en statique ([web-ui.md](web-ui.md)) |
| `releases` | ✅ | Détection des mises à jour du serveur, et version d'app attendue |

Chaque module expose un `Service` (métier, testable sans HTTP) et un `Controller`
(validation et transport). La règle : **aucune logique métier dans un contrôleur**.

## Un serveur, un foyer

Il n'y a pas de frontière d'isolation à défendre : toutes les données appartiennent au
même foyer, et tout compte authentifié en est membre. Cela retire la part la plus
risquée de l'ancienne conception — un `householdId` oublié dans une clause `WHERE` —
et la remplace par une question plus simple : **ce compte a-t-il le droit de faire
cela ?**

1. Le JWT porte `sub` (userId), **pas** les droits : un statut modifié doit prendre
   effet sans attendre l'expiration du jeton.
2. Un `RightsGuard` résout le statut de l'appelant à chaque requête et compare ses
   droits à ceux exigés par la route (`@RequiresRight('MANAGE_TASKS')`). Un droit
   manquant est un `403` : il n'y a plus d'existence à cacher, donc plus de raison de
   répondre `404`.
3. **Aucun cache de droits.** Le statut est lu dans la même requête que le compte,
   par `JwtStrategy`, à chaque appel. L'ancien cache d'appartenance (30 s) a disparu
   avec le problème qu'il créait : porté par le garde, il n'était pas celui que le
   service invalidait, et un changement restait sans effet pendant 30 secondes. Une
   jointure de plus sur un index coûte moins cher qu'un cache à invalider.
4. Les routes exigent un **droit**, jamais un nom de statut. Un foyer qui renomme
   « Adulte » en « Grand » ne doit pas changer de comportement, et un foyer qui crée
   un statut « Colocataire » ne doit pas avoir à patcher le serveur.
5. **Au moins un compte garde `MANAGE_STATUSES` et `MANAGE_SERVER`.** Sans cela, plus
   personne ne peut administrer le foyer. La règle est vérifiée au changement de
   statut comme à la suppression d'un compte, et a son test dédié.

## Sortie d'un foyer

Il n'y a **pas d'exclusion** : personne ne peut sortir quelqu'un d'autre du foyer, et
il n'y a pas non plus de départ volontaire. La seule sortie est la suppression du
compte, par son titulaire ou par un compte portant `MANAGE_SERVER`.

Deux conséquences de conception :

1. **Une suppression ne peut pas être refusée.** Si le compte est le dernier à porter
   `MANAGE_SERVER` ou `MANAGE_STATUSES`, ces droits passent au compte actif le plus
   ancien ; s'il ne reste personne, le foyer est supprimé avec lui. Refuser la
   suppression « parce que vous êtes le dernier administrateur » reviendrait à retenir
   quelqu'un dans le produit.
2. **Le compte est anonymisé, pas effacé.** La ligne reste, vidée de toute donnée
   personnelle, pour que l'historique du foyer garde un auteur. Comme les textes du
   fil d'activité ne recopient pas le nom, anonymiser le compte anonymise tout son
   historique d'un coup.

## Jobs planifiés

BullMQ + Redis. Tous les jobs sont **idempotents** et rejouables : c'est la
contrainte qui permet de les relancer après une coupure sans rien corrompre.

| Job | Fréquence | Rôle |
|---|---|---|
| `tasks.materialize` | 1×/h (à :07) | Matérialise les occurrences de −14 à +60 jours |
| `tasks.markMissed` | 15 min | Passe en `MISSED` au-delà du délai de grâce |
| `releases.check` | 1×/j (à 4h23) | Regarde s'il existe une version plus récente du serveur et de l'app |
| `calendar.sync` | 15 min / compte | Synchronisation incrémentale des agendas |
| `notifications.dispatch` | 1 min | Envoie les rappels dus |
| `maintenance.purge` | 1×/j | Purge les tokens expirés et les suppressions logiques > 90 j |

Pourquoi des jobs plutôt que du calcul à la volée : les occurrences et les retards
sont des **faits** que l'on veut dans l'historique, et le mobile hors-ligne a besoin
d'un état stable à synchroniser, pas d'un résultat qui change à chaque lecture.

Un balayage peut être relancé à la main — `POST /api/v1/admin/jobs/:name/run`,
réservé aux administrateurs de l'instance — ce qui sert quand Redis a été
indisponible. Comme les jobs sont idempotents, un déclenchement manuel ne risque
rien.

Redis indisponible n'empêche pas le serveur de démarrer : l'API répond, seuls les
balayages automatiques manquent, et `/health` le signale. Un serveur domestique
redémarre sans prévenir, l'API ne doit pas en dépendre.

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
| **Tâches de fond en journal d'occurrences** | Historique, annulation, pas d'écrasement entre deux clients — et le même objet que les autres tâches, donc la même synchro et le même écran. | Un champ `lastDoneAt` — perd l'historique et se corrompt dès deux saisies hors-ligne concurrentes. Une table `counters` séparée — deux listes là où le foyer n'en vit qu'une. |
| **Priorités en entier signé (+3…−3)** | Tri évident en SQL, et un niveau s'ajoute sans migration de données. | Une énumération de libellés — renommer « Très basse » imposerait une migration. |
| **JWT + refresh rotatif** | Pas d'état de session côté serveur, révocation possible appareil par appareil. | Sessions en base — lectures supplémentaires sur chaque requête d'un serveur modeste. |
| **Docker Compose** | Trois conteneurs, une commande, sauvegarde triviale. | Kubernetes — hors sujet pour un Raspberry Pi. |

## Sécurité

- Mots de passe en **Argon2id** (jamais bcrypt pour un nouveau projet).
- Identifiants d'agenda chiffrés en **AES-256-GCM**, clé hors base
  (`MH_ENCRYPTION_KEY`). Une fuite du dump SQL ne donne pas accès aux agendas.
  *(v0.5 ; la variable est déjà exigée au démarrage, car la clé doit être fixée et
  sauvegardée avant que des identifiants soient chiffrés avec elle.)*
- Limitation de débit par route : connexion 5 / 15 min, inscription 20 / h, le reste
  300 / min, par IP. **Un limiteur nommé déclaré dans `ThrottlerModule` s'applique à
  toutes les routes** : la limite stricte se pose route par route avec `@Throttle`,
  jamais globalement.
- Pas de secret dans les logs : un intercepteur masque `password`, `credentials`,
  `token`, `code`.
- CORS fermé par défaut — le client est une app mobile, pas un navigateur.
- Les erreurs renvoyées au client ne contiennent jamais de détail d'implémentation.

## Tests

| Niveau | Portée | Outil |
|---|---|---|
| Unitaire | Récurrence, état dérivé des tâches de fond, rotation, fuseaux | Jest |
| Intégration | Un test de **droit requis par endpoint**, et la règle du dernier administrateur | Jest + Testcontainers *(à écrire)* |
| Bout en bout | 20 vérifications : rôles, isolation, invitations, débit | `scripts/smoke.sh` |
| Contrat | Les réponses respectent le schéma OpenAPI publié | Jest + validateur |

La logique temporelle se teste avec une horloge injectée, jamais avec `new Date()` en
dur : un test qui dépend de l'heure réelle d'exécution finit toujours par échouer un
dimanche à 2h du matin.
