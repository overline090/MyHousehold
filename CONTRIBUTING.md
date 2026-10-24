# Contribuer à MyHousehold

Merci de l'intérêt porté au projet. Les contributions sont ouvertes à tout le monde,
sans sélection : code, documentation, traductions, tests, retours d'usage, relecture
critique de la conception.

## Avant tout : la licence

MyHousehold est sous [PolyForm Noncommercial 1.0.0](LICENSE).

**Ce que ça autorise :** utiliser, modifier, redistribuer, héberger le projet pour
soi, sa famille, une colocation, une association, une école, une collectivité.

**Ce que ça interdit :** toute exploitation commerciale. Pas de revente, pas d'offre
d'hébergement payante, pas d'intégration dans un produit ou service payant, pas
d'usage par une entreprise dans le cadre de son activité lucrative.

Ce n'est volontairement *pas* une licence open source au sens de l'OSI, qui exige
d'autoriser l'usage commercial. Dire « open source » à propos de MyHousehold serait
inexact ; « libre d'usage et de modification, non commercial » est la formulation
juste.

### En proposant une contribution

Vous acceptez que votre contribution soit distribuée sous cette même licence
(*inbound = outbound*), et vous certifiez avoir le droit de la proposer — en
particulier qu'elle ne vous appartient pas à votre employeur.

Signez vos commits avec `git commit -s`, qui ajoute :

```
Signed-off-by: Prénom Nom <email@example.com>
```

C'est le [Developer Certificate of Origin](https://developercertificate.org/) : une
simple attestation, pas une cession de droits. Vous restez titulaire du copyright sur
votre contribution.

**Conséquence à connaître :** comme chaque contributeur garde ses droits, un éventuel
changement de licence nécessiterait l'accord de tous. C'est délibéré — cela protège
le caractère non commercial du projet contre un revirement unilatéral, y compris de
son auteur initial.

## Code de conduite

Lisez [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). En résumé : on se parle correctement.

## Par où commencer

Le serveur est en **v0.1** : comptes et foyers fonctionnent, le reste est spécifié
mais pas écrit. Les contributions utiles aujourd'hui, par ordre d'impact :

1. **Relire la conception** — [`docs/data-model.md`](docs/data-model.md),
   [`docs/api.md`](docs/api.md), [`docs/sync.md`](docs/sync.md). Les erreurs de
   modèle de données coûtent cent fois plus cher après la première migration.
2. **Répondre aux questions ouvertes** — fin de `data-model.md` et de `sync.md`.
3. **Décrire votre foyer** — comment vous organisez-vous réellement ? Le modèle
   couvre-t-il votre cas ? Les cas limites (garde alternée, colocation tournante,
   semaine décalée) sont précieux.
4. **Prendre un élément de la v0.2** dans [`docs/roadmap.md`](docs/roadmap.md) — les
   tâches récurrentes sont la prochaine étape, et la plus intéressante : récurrence
   RRULE, matérialisation des occurrences, rotation entre membres.
5. **Remplacer `scripts/smoke.sh` par des tests d'intégration** (Testcontainers).
   C'est le manque le plus criant de la v0.1.

Ouvrez une issue avant de commencer une fonctionnalité conséquente : cela évite deux
personnes sur le même sujet, et permet de valider l'approche avant l'effort.

## Flux de travail

```bash
git clone https://github.com/overline090/MyHousehold.git
cd MyHousehold
git checkout -b feat/ma-fonctionnalite
# ...
git commit -s -m "feat(tasks): gère les rotations sur les tâches hebdomadaires"
git push -u origin feat/ma-fonctionnalite
```

Branches : `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`.

Commits au format [Conventional Commits](https://www.conventionalcommits.org/) :
`type(portée): description à l'impératif`. Le type et la portée servent à générer le
journal des versions.

## Attentes sur le code

Rien n'est encore figé puisque le code n'existe pas, mais les règles posées dans
[`docs/architecture.md`](docs/architecture.md) s'appliqueront :

- **Aucune logique métier dans un contrôleur.** Le contrôleur valide et transporte.
- **Un test d'isolation de foyer par endpoint.** Non négociable à la revue : c'est la
  seule frontière de sécurité du projet.
- **Horloge injectée** pour tout ce qui touche au temps. Un test qui appelle
  `new Date()` finit par échouer un dimanche de changement d'heure.
- **Jobs idempotents.** Ils doivent pouvoir être rejoués après une coupure.
- **Pas de secret dans les logs.**
- **Les migrations ne se réécrivent pas.** Une migration livrée est immuable ;
  on en ajoute une nouvelle.
- **Pas d'exclusion, nulle part.** Personne ne peut sortir quelqu'un d'autre d'un
  foyer. Une proposition de fonctionnalité qui revient à exclure un membre sera
  refusée, même sous un autre nom. La seule sortie est la suppression du compte.
- **Une suppression de compte ne se refuse pas.** Jamais de blocage pour une raison
  d'organisation : s'il manque un propriétaire, on transmet le rôle.
- **Pas de limiteur de débit nommé déclaré globalement.** `ThrottlerGuard` applique
  tous les limiteurs configurés à toutes les routes : un limiteur « pour
  l'authentification » déclaré dans `ThrottlerModule` plafonnait l'API entière à 5
  requêtes par quart d'heure. Les routes sensibles se resserrent avec `@Throttle`.

### Mise en route

```bash
npm ci
cp .env.example .env            # remplacer les CHANGEME
docker compose up -d db redis
npx prisma migrate deploy
npm run start:dev
```

Après toute modification du schéma Prisma : `npx prisma migrate dev --name <sujet>`,
jamais une modification manuelle d'une migration déjà livrée.

Prisma 7 a besoin d'une base jetable pour comparer l'historique des migrations au
schéma. Ajoutez `SHADOW_DATABASE_URL` à votre `.env` (une seconde base sur le même
serveur suffit) : sans elle, `migrate dev` échoue avec un message sur
`datasource.shadowDatabaseUrl`. Elle est inutile en production, où seul
`migrate deploy` tourne.

Avant d'ouvrir une pull request :

```bash
npm run lint
npm test
npm run build
./scripts/smoke.sh http://localhost:3000   # si vous touchez à l'API
```

Les tests tournent en mode ESM (`node --experimental-vm-modules`) : Jest 30 sous
Node 22 ne sait pas charger un paquet ESM depuis un module CommonJS, et NestJS 12
est publié en ESM. C'est la raison du drapeau dans le script `test`.

## Pull requests

- Une PR = un sujet. Une PR qui corrige un bug *et* reformate trois fichiers est
  impossible à relire.
- Décrivez le *pourquoi*, pas le *quoi* — le diff dit déjà le quoi.
- Si le comportement visible change, mettez la documentation à jour dans la même PR.
- Les PR de documentation sont des contributions à part entière.

La revue cherche à comprendre et à améliorer, pas à juger. Une remarque porte sur le
code, jamais sur la personne. Si une remarque vous paraît injuste, dites-le : c'est
peut-être la remarque qui est à côté.

## Signaler un bug

Indiquez la version du serveur et de l'app, les étapes de reproduction, le
comportement attendu et le comportement observé. Les logs pertinents aident — en
retirant les jetons et identifiants.

## Signaler une faille de sécurité

**N'ouvrez pas d'issue publique.** Utilisez l'onglet *Security* → *Report a
vulnerability* du dépôt GitHub, ou contactez le mainteneur en privé. Un serveur
auto-hébergé ne se met pas à jour automatiquement : laissez le temps aux
utilisateurs d'appliquer un correctif avant toute divulgation.

## Questions

Ouvrez une issue avec le label `question`. Il n'y a pas de question bête dans un
projet dont la documentation est, par définition, encore incomplète.
