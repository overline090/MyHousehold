# MyHousehold — Serveur

Assistant de gestion du quotidien pour un foyer : tâches récurrentes, tâches de fond,
rendez-vous et synchronisation des agendas personnels.

Ce dépôt contient le **serveur auto-hébergé**. L'application mobile Android vit dans
[MyHousehold-android](https://github.com/overline090/MyHousehold-android).

> ⚠️ **v0.3.** Les quatre besoins ci-dessus sont couverts **côté serveur** : comptes,
> membres et invitations, tâches récurrentes, compteurs de temps, rendez-vous et
> agenda fusionné. Restent à écrire l'**application Android**, l'**interface web**
> avec son assistant d'installation, et la **synchronisation des agendas externes** :
> voir [`docs/roadmap.md`](docs/roadmap.md).
>
> Le modèle a été **révisé** depuis : un seul foyer par serveur, une seule notion de
> tâche (récurrente, de fond ou ponctuelle), des statuts à droits configurables depuis
> l'interface web, plus de points. C'est décidé dans
> [`docs/data-model.md`](docs/data-model.md) et [`docs/api.md`](docs/api.md), et pas
> encore dans le code : la reprise est le premier chantier de la feuille de route. Les
> contributions sur la spécification sont aussi bienvenues que celles sur le code.

## L'idée

Un foyer (*household*), c'est plusieurs personnes qui partagent un lieu, des corvées
et un calendrier. MyHousehold répond à quatre besoins concrets :

| Besoin | Réponse |
|---|---|
| « Qui sort les poubelles ce soir ? » | **Tâches récurrentes** avec temporalité et rotation entre membres |
| « Ça fait combien de temps qu'on n'a pas changé les draps ? » | **Tâches de fond**, à refaire dans un délai plutôt qu'à une date |
| « On a rendez-vous chez le dentiste quand ? » | **Rendez-vous** partagés au niveau du foyer |
| « Est-ce que je suis libre mardi ? » | **Synchronisation** de l'agenda personnel de chacun (Google, CalDAV, ICS) |

Tout est une **tâche** : ce qui change, c'est la façon dont elle est due.

- une tâche **récurrente** est pilotée par le calendrier — « chaque lundi à 19 h » ;
- une tâche **de fond** est pilotée par le temps écoulé — « à refaire dans les
  14 jours », sans date imposée. L'app montre le temps depuis la dernière fois ;
- une tâche **ponctuelle** se fait une seule fois, avec ou sans date limite —
  « changer le fusible avant le 15 novembre ».

## Principes

- **Auto-hébergé d'abord.** Tourne sur un Raspberry Pi, un NAS ou un petit VPS. Pas
  de service cloud obligatoire, pas de compte chez nous — il n'y a pas de « chez nous ».
- **Installable sans terminal.** On branche, on ouvre une page, on suit l'assistant.
- **L'app marche sans serveur.** Le serveur sert à *partager* un foyer, pas à
  l'utiliser.
- **Vos données restent chez vous.** Les identifiants d'agenda sont chiffrés au repos
  et ne quittent jamais votre serveur.
- **Hors-ligne d'abord côté mobile.** L'app reste utilisable sans réseau et se
  réconcilie ensuite.
- **Pas d'exclusion entre membres.** On ne peut pas sortir quelqu'un d'un foyer : un
  foyer n'est pas un groupe qu'on quitte, c'est un lieu où l'on vit. La seule sortie
  est la suppression de son compte, qui anonymise l'historique sans le détruire.
- **Non lucratif.** Voir [Licence](#licence).

## Stack technique

| Couche | Choix |
|---|---|
| Runtime | Node.js 22 LTS |
| Framework | NestJS (TypeScript) |
| Base de données | PostgreSQL 16 |
| ORM / migrations | Prisma |
| Tâches planifiées | BullMQ + Redis |
| Auth | JWT (access court + refresh rotatif) |
| Agendas | OAuth 2.0 (Google), CalDAV (RFC 4791), ICS (RFC 5545) |
| Interface web | Svelte + Vite, servie en statique par Nest |
| Déploiement | Docker Compose, et image Raspberry Pi |

Les raisons de ces choix et les alternatives écartées sont dans
[`docs/architecture.md`](docs/architecture.md).

## Démarrage

```bash
cp .env.example .env            # puis remplacer les CHANGEME
docker compose up -d --build
curl http://localhost:3000/health
```

Puis ouvrez **http://localhost:3000/setup** : l'assistant vous guide jusqu'au foyer
fonctionnel, sans terminal.

Installation détaillée, sauvegardes et reverse proxy :
[`docs/self-hosting.md`](docs/self-hosting.md).

### En développement

```bash
npm ci
docker compose up -d db redis   # seules les dépendances
npx prisma migrate deploy
npm run start:dev

npm test                        # tests unitaires
npm run lint
./scripts/smoke.sh http://localhost:3000   # parcours de bout en bout
```

`scripts/smoke.sh` écrit dans la base du serveur visé : à n'utiliser que sur une
instance de développement.

## Documentation

| Document | Contenu |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Vue d'ensemble, modules, choix techniques |
| [`docs/data-model.md`](docs/data-model.md) | Toutes les entités, relations et règles métier |
| [`docs/api.md`](docs/api.md) | Contrat REST complet, endpoint par endpoint |
| [`docs/sync.md`](docs/sync.md) | Protocole de synchronisation hors-ligne du mobile |
| [`docs/calendar-sync.md`](docs/calendar-sync.md) | Intégration Google / CalDAV / ICS |
| [`docs/web-ui.md`](docs/web-ui.md) | Interface web : périmètre, choix techniques |
| [`docs/setup-wizard.md`](docs/setup-wizard.md) | Assistant d'installation pas à pas |
| [`docs/self-hosting.md`](docs/self-hosting.md) | Installation, sauvegardes, reverse proxy |
| [`docs/raspberry-pi.md`](docs/raspberry-pi.md) | Déploiement sur Raspberry Pi |
| [`docs/roadmap.md`](docs/roadmap.md) | Jalons et périmètre de chaque version |

## Contribuer

Les contributions sont ouvertes à tout le monde — correctifs, fonctionnalités,
traductions, documentation, retours d'usage. Lisez
[CONTRIBUTING.md](CONTRIBUTING.md) avant de commencer, en particulier la section sur
la licence.

Bons premiers sujets : relire le modèle de données, challenger le contrat d'API,
documenter votre configuration d'auto-hébergement.

## Licence

[PolyForm Noncommercial License 1.0.0](LICENSE).

**En clair :** vous pouvez utiliser, modifier, partager et héberger MyHousehold
librement, pour vous, votre famille, une association, une école ou une collectivité.
En revanche **toute exploitation commerciale est interdite** : pas de revente, pas
d'offre d'hébergement payante, pas d'intégration dans un produit payant.

Ce n'est volontairement *pas* une licence open source au sens de l'OSI, qui exige
d'autoriser l'usage commercial. C'est un choix assumé : le projet est libre d'usage
et d'amélioration, pas libre d'exploitation.

Pour un usage commercial, il faut une autorisation écrite du détenteur des droits.

Required Notice: Copyright 2026 overline090 (https://github.com/overline090/MyHousehold)
