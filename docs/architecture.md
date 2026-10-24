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

« ✅ » = implémenté en v0.1, « · » = spécifié, pas encore écrit.

| Module | État | Responsabilité |
|---|---|---|
| `auth` | ✅ | Inscription, connexion, rotation des refresh tokens, gardes |
| `households` | ✅ | Foyers, membres, rôles, invitations |
| `users` | ✅ | Suppression de compte avec anonymisation (profil et préférences à venir) |
| `admin` | ✅ | Administration de l'instance : comptes, suppression |
| `health` | ✅ | `/health` et `/version` |
| `tasks` | ✅ | Définitions, assignation, occurrences, complétion |
| `scheduler` | ✅ | Jobs BullMQ : matérialisation, passage en « manquée » |
| `counters` | · | Définitions et événements de remise à zéro |
| `appointments` | · | Rendez-vous et participants |
| `calendar` | · | Comptes externes, adaptateurs de synchronisation |
| `sync` | · | Endpoint de delta pour le client mobile |
| `notifications` | · | Rappels, échéances, envoi push |
| `activity` | · | Fil d'activité du foyer (la table existe et est alimentée) |

Chaque module expose un `Service` (métier, testable sans HTTP) et un `Controller`
(validation et transport). La règle : **aucune logique métier dans un contrôleur**.

## Isolation des foyers

Tout l'enjeu de sécurité est là : un membre du foyer A ne doit jamais atteindre une
donnée du foyer B.

1. Le JWT porte `sub` (userId), **pas** la liste des foyers — elle changerait sans
   que le token expire.
2. Un `HouseholdMemberGuard` résout l'appartenance à chaque requête et rejette en
   `404` — pas `403`, pour ne pas confirmer l'existence d'un foyer qu'on n'a pas le
   droit de voir. `403` est réservé au cas « membre, mais rôle insuffisant ».
3. Le cache des appartenances (30 s) vit dans un fournisseur distinct,
   `MembershipCacheService`, et **pas** dans le garde : Nest peut créer sa propre
   instance d'un garde déclaré par `@UseGuards`, et un cache porté par le garde
   n'est alors pas celui que le service invalide. Symptôme observé avant correction :
   un membre exclu gardait l'accès pendant 30 secondes.
4. Toute requête porte `householdId` dans sa clause `WHERE`. L'isolation doit être
   vérifiée par un test pour chaque endpoint : c'est non négociable à la revue. En
   v0.1 cette vérification est faite par `scripts/smoke.sh` faute de tests
   d'intégration automatisés — c'est une dette, pas une cible.

## Sortie d'un foyer

Il n'y a **pas d'exclusion** : personne ne peut sortir quelqu'un d'autre d'un foyer,
et il n'y a pas non plus de départ volontaire. La seule sortie est la suppression du
compte, par son titulaire ou par un administrateur de l'instance.

Deux conséquences de conception :

1. **Une suppression ne peut pas être refusée.** Si le compte est le dernier
   propriétaire d'un foyer, la propriété est transmise (adulte le plus ancien, sinon
   enfant le plus ancien) ; sans successeur, le foyer est supprimé. Refuser la
   suppression « parce que vous êtes le dernier propriétaire » reviendrait à retenir
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
| **Compteurs en journal d'événements** | Historique, annulation, pas d'écrasement entre deux clients. | Un champ `lastResetAt` — perd l'historique et se corrompt dès deux saisies hors-ligne concurrentes. |
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
| Unitaire | Récurrence, calcul d'état des compteurs, rotation, fuseaux | Jest |
| Intégration | Un test d'isolation de foyer **par endpoint** | Jest + Testcontainers *(à écrire)* |
| Bout en bout | 20 vérifications : rôles, isolation, invitations, débit | `scripts/smoke.sh` |
| Contrat | Les réponses respectent le schéma OpenAPI publié | Jest + validateur |

La logique temporelle se teste avec une horloge injectée, jamais avec `new Date()` en
dur : un test qui dépend de l'heure réelle d'exécution finit toujours par échouer un
dimanche à 2h du matin.
