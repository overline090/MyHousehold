# Protocole de synchronisation hors-ligne

L'app Android doit rester utilisable sans réseau : cocher une tâche dans un
sous-sol, déclarer une tâche de fond faite en vacances. Ce document définit comment ces
mutations remontent et comment les conflits se règlent.

## Principes

1. **Le serveur est l'autorité.** En cas de divergence, c'est son état qui gagne.
2. **Le client génère les identifiants.** UUID v7 côté app : rejouer une création
   n'en fait pas deux.
3. **Les faits portent leur propre date.** `completedAt`, `occurredAt` sont ceux de
   l'action, pas de la synchro.
4. **Les suppressions sont logiques.** Sans `deletedAt`, un client hors-ligne ne
   peut pas apprendre qu'un objet a disparu.

## Delta descendant

`GET /sync/delta?since=<cursor>` renvoie tout ce qui a changé depuis le curseur.

```json
{
  "cursor": "eyJ0IjoiMjAyNi0xMC0yNFQxNzozMDowMFoifQ",
  "serverTime": "2026-10-24T17:30:05Z",
  "hasMore": false,
  "changes": {
    "households":   { "upserted": [], "deleted": [] },
    "members":      { "upserted": [], "deleted": [] },
    "taskDefinitions": { "upserted": [], "deleted": [] },
    "taskOccurrences": { "upserted": [], "deleted": [] },
    "counterDefinitions": { "upserted": [], "deleted": [] },
    "counterEvents": { "upserted": [], "deleted": [] },
    "appointments": { "upserted": [], "deleted": [] }
  }
}
```

- `cursor` est opaque (timestamp + id encodés). Le client le stocke et le renvoie tel
  quel. Opaque par choix : son format pourra changer sans casser les clients.
- `deleted` ne contient que des identifiants.
- Sans `since`, c'est un **amorçage complet**, borné à ±90 jours autour d'aujourd'hui
  pour ne pas transférer des années d'historique à l'installation.
- `hasMore` à `true` → rappeler immédiatement avec le nouveau curseur. Les lots sont
  plafonnés à 500 entités.
- `serverTime` permet au client de mesurer sa dérive d'horloge et d'afficher « il y a
  3 jours » correctement même si le téléphone est déréglé.

## Push montant

`POST /sync/push` envoie les mutations accumulées dans la file locale, **dans
l'ordre**.

```json
{
  "mutations": [
    {
      "clientMutationId": "0192f2b1-...",
      "type": "COMPLETE_OCCURRENCE",
      "payload": { "occurrenceId": "...", "completedAt": "2026-10-24T18:02:00Z" }
    },
    {
      "clientMutationId": "0192f2b2-...",
      "type": "CREATE_COUNTER_EVENT",
      "payload": { "id": "...", "counterDefinitionId": "...", "occurredAt": "..." }
    }
  ]
}
```

Réponse : un résultat **par mutation**, dans le même ordre.

```json
{
  "results": [
    { "clientMutationId": "0192f2b1-...", "status": "APPLIED" },
    { "clientMutationId": "0192f2b2-...", "status": "DUPLICATE" },
    {
      "clientMutationId": "0192f2b3-...",
      "status": "REJECTED",
      "error": { "code": "TASK_ALREADY_COMPLETED", "message": "..." },
      "resolution": "SERVER_WINS",
      "serverState": { "...": "..." }
    }
  ],
  "cursor": "..."
}
```

Statuts : `APPLIED`, `DUPLICATE` (déjà appliquée — succès, pas erreur), `REJECTED`
(avec l'état serveur pour que le client se corrige sans attendre un delta).

Le serveur traite les mutations **une par une, pas en transaction unique** : une
mutation invalide ne doit pas bloquer les quinze suivantes, sinon la file locale se
bouche définitivement sur un seul élément corrompu.

`clientMutationId` est conservé 30 jours côté serveur dans une table de
déduplication — c'est ce qui garantit l'idempotence même si la réponse se perd.

## Conflits

| Situation | Résolution |
|---|---|
| Deux membres cochent la même occurrence | Le premier arrivé gagne. Le second reçoit `DUPLICATE` et l'app affiche « déjà fait par Marie ». |
| Tâche de fond déclarée faite deux fois hors-ligne | **Les deux événements sont conservés.** C'est un journal : deux saisies sont deux faits, et seule la plus récente détermine l'état. |
| Occurrence modifiée côté serveur et côté client | Dernière écriture gagnante **par champ** (`updatedAt` par champ sur les seuls champs modifiables : `assigneeId`, `dueAt`, `note`). |
| Objet supprimé pendant que le client le modifiait | La mutation est `REJECTED` (`NOT_FOUND`), le client retire l'objet. |
| Occurrence cochée alors que sa définition a été supprimée | Acceptée : le fait reste vrai, et l'historique doit le refléter. |

Le cas de la tâche de fond est le plus important à comprendre : si l'on avait modélisé
son état avec un champ `lastDoneAt`, deux complétions hors-ligne auraient donné une
perte de donnée silencieuse. Le journal d'occurrences rend le conflit impossible par
construction.

## Cycle de vie côté client

```
Action utilisateur
   ├─► écriture optimiste dans Room (l'UI répond immédiatement)
   └─► mutation ajoutée à la file locale
            │
     WorkManager (réseau disponible)
            ├─► POST /sync/push     → applique les résultats
            └─► GET  /sync/delta    → réconcilie l'état local
```

Reprise sur erreur : backoff exponentiel (30 s → 15 min), file persistée en base
locale pour survivre à un redémarrage. Une mutation `REJECTED` sort de la file (la
rejouer échouerait toujours) et son conflit est affiché à l'utilisateur.

## Notifications push

Un push ne transporte **jamais** de données métier, seulement un signal
`{"type":"sync"}` qui déclenche un delta. Deux raisons : la taille des payloads est
limitée, et le contenu du foyer n'a pas à transiter par les serveurs de Google.

## Points à valider à l'implémentation

1. La fenêtre de ±90 jours à l'amorçage est-elle suffisante pour les statistiques
   annuelles, ou faut-il un endpoint d'historique distinct et paginé ?
2. 500 entités par lot : à mesurer sur un vrai foyer après quelques mois d'usage.
3. Faut-il compresser les réponses de delta (`gzip`) dès la v1 ? Probablement oui
   au-delà de quelques centaines d'entités.
