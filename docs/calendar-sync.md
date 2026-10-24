# Synchronisation des agendas

Objectif : voir dans MyHousehold les disponibilités réelles de chaque membre, sans
l'obliger à ressaisir son agenda ni à exposer le contenu de son agenda
professionnel.

## Modèle

Un `CalendarAccount` appartient à un **utilisateur**, jamais au foyer : c'est son
agenda, il en garde le contrôle et peut le retirer à tout moment. Ce qui est partagé
avec le foyer est déterminé par deux réglages :

| Réglage | Effet |
|---|---|
| `busyOnly` | N'importe que la plage horaire. Le titre devient « Occupé ». |
| `defaultVisibility` | `HOUSEHOLD` (visible de tous) ou `PRIVATE` (soi seul) |

`busyOnly` est activé **par défaut**. Le réglage le plus protecteur doit être celui
qu'on obtient sans rien configurer.

Les événements importés sont **en lecture seule** en v1 (`source = IMPORTED`). Toute
tentative de modification renvoie `409 APPOINTMENT_READ_ONLY`.

## Les trois fournisseurs

### 1. Flux ICS (le plus simple)

L'utilisateur colle l'URL privée que Google, Outlook ou Nextcloud fournissent
(« adresse secrète au format iCal »).

- Lecture seule par nature, aucun OAuth, aucune configuration serveur.
- Synchro par `GET` conditionnel (`If-None-Match` / `If-Modified-Since`) : on ne
  retélécharge que si le flux a changé.
- Limite réelle : les fournisseurs rafraîchissent ces flux **toutes les 8 à 24 h**.
  Un rendez-vous créé le matin peut n'apparaître que le soir. À dire clairement dans
  l'interface, sinon l'utilisateur croira à un bug.

### 2. CalDAV (RFC 4791)

Pour Nextcloud, Baïkal, Radicale, Fastmail, iCloud.

- Authentification basique sur HTTPS (ou mot de passe d'application).
- Synchro incrémentale via `ctag` sur la collection puis `ETag` par événement : un
  `REPORT sync-collection` renvoie uniquement les changements.
- Temps réel ou presque, et bidirectionnel à terme. C'est la voie à privilégier
  pour qui auto-héberge déjà son agenda.

### 3. Google Calendar (OAuth 2.0)

Le plus demandé, et le plus contraignant à mettre en place.

- Scope **`calendar.readonly`** en v1. Demander l'écriture dès le départ ferait
  échouer la validation Google sans justification d'usage.
- Synchro incrémentale par `syncToken` (`events.list`). Un token expiré renvoie
  `410 Gone` → il faut refaire une synchro complète ; ce cas **doit** être géré, il
  arrive naturellement après quelques semaines.
- `watch` (webhooks) est possible mais exige une URL publique en HTTPS avec un
  certificat valide : incompatible avec beaucoup d'auto-hébergements. On reste donc
  en polling toutes les 15 minutes.

**Contrainte à connaître avant de se lancer :** le callback OAuth impose une URL de
redirection accessible, et chaque hébergeur a la sienne. Trois chemins possibles :

1. L'utilisateur crée **son propre** projet Google Cloud et ses identifiants OAuth
   (`MH_GOOGLE_CLIENT_ID` / `_SECRET`). Souverain, mais une bonne demi-heure de
   manipulations dans une console peu accueillante.
2. Un relais de callback hébergé par le projet, qui ne fait que renvoyer le code vers
   l'instance. Confortable, mais cela réintroduit une dépendance centrale que le
   projet veut éviter.
3. Le flux « appareil » (device flow). Google ne le propose pas pour l'API Calendar.

**Retenu : l'option 1**, documentée pas à pas dans
[`self-hosting.md`](self-hosting.md). L'option 2 reste discutable si la mise en route
se révèle trop dissuasive à l'usage — avis de contributeurs bienvenus.

## Boucle de synchronisation

```
calendar.sync (toutes les 15 min, par compte actif)
  │
  ├─ 1. Récupère les changements (syncToken | ctag/ETag | ETag HTTP)
  ├─ 2. Pour chaque événement distant :
  │      ├─ connu (ExternalEvent) et ETag identique → ignorer
  │      ├─ connu et modifié                        → mettre à jour l'Appointment
  │      └─ inconnu                                 → créer l'Appointment + le mapping
  ├─ 3. Marque lastSeenAt sur tout ce qui a été vu
  ├─ 4. Après une synchro *complète* : supprime ce qui n'a pas été revu
  └─ 5. Écrit lastSyncAt, ou lastError + lastErrorAt
```

L'étape 4 ne s'exécute **jamais** après une synchro incrémentale : un delta ne
contient par définition qu'une partie des événements, et appliquer la règle « non vu
donc supprimé » y effacerait tout l'agenda.

## Récurrences et exceptions

Les événements récurrents arrivent avec une `RRULE`, des `EXDATE` et parfois des
instances modifiées (`RECURRENCE-ID`). En v1, on stocke la règle telle quelle sur
l'`Appointment` et on déroule à l'affichage ; les instances modifiées deviennent des
`Appointment` distincts portant le même `externalUid` et une `recurrenceId`.

Une récurrence sans fin est bornée à l'horizon d'affichage (±90 jours), jamais
déroulée intégralement.

## Fuseaux horaires

Les événements iCalendar portent souvent un `TZID` plutôt qu'un instant UTC
(`DTSTART;TZID=Europe/Paris:20261027T190000`). La conversion utilise la base de
fuseaux du système, et les événements « journée entière » (`VALUE=DATE`) restent des
dates sans heure — les convertir en instants les décale d'un jour pour les
utilisateurs à l'ouest de Greenwich.

## Gestion des pannes

| Panne | Comportement |
|---|---|
| Serveur distant injoignable | Backoff exponentiel, 5 tentatives, puis `lastError` et attente du cycle suivant |
| Identifiants invalidés (401/403) | Compte marqué `isActive = false`, notification à son propriétaire |
| `syncToken` expiré (410) | Synchro complète automatique |
| Flux ICS malformé | Rejet du lot entier, `lastError` renseigné. Jamais d'import partiel : mieux vaut un agenda vieux d'une heure qu'un agenda à moitié faux |

Les erreurs de synchro d'un membre n'affectent jamais les autres : chaque compte est
traité dans son propre job.

## Écriture vers l'extérieur (v2)

Pousser un rendez-vous MyHousehold vers l'agenda personnel est très demandé, et
notablement plus risqué : un bug d'écriture peut détruire des données dans l'agenda
de quelqu'un. Prérequis avant d'ouvrir le sujet :

- un agenda dédié, créé par MyHousehold (« Foyer »), jamais l'agenda principal ;
- ne jamais toucher un événement dont `externalUid` n'a pas été créé par nous ;
- un mode simulation vérifiable avant la première écriture réelle.
