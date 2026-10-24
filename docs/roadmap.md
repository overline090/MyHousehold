# Feuille de route

Les versions sont définies par ce qu'elles rendent **utilisable**, pas par un
calendrier. Aucune date n'est promise : c'est un projet communautaire sans
engagement de délai.

## v0.1 — Fondations (faite)

- [x] Licence non commerciale (PolyForm Noncommercial 1.0.0)
- [x] Modèle de données complet
- [x] Contrat d'API REST
- [x] Protocole de synchronisation hors-ligne
- [x] Stratégie de synchronisation d'agenda
- [x] Squelette NestJS + Docker Compose
- [x] Schéma Prisma et première migration
- [x] Authentification (inscription, connexion, rotation des refresh tokens)
- [x] Foyers, membres, rôles, invitations
- [x] Isolation des foyers (404 pour un non-membre), rôles, dernier propriétaire protégé
- [x] Enveloppe d'erreur unique à codes stables
- [x] Suppression de compte : anonymisation, transfert de propriété, rôle d'administrateur d'instance
- [x] `scripts/smoke.sh` : parcours de bout en bout, 30 vérifications
- [ ] Tests d'intégration automatisés (Testcontainers) en remplacement du script

**Jalon atteint :** deux comptes peuvent rejoindre un même foyer, avec des rôles
distincts et une isolation vérifiée.

## v0.2 — Tâches (prochaine étape)

- [ ] CRUD des définitions avec RRULE
- [ ] Job de matérialisation des occurrences (60 jours glissants)
- [ ] Assignation : `FIXED`, `ROTATION`, `ANYONE`
- [ ] Complétion, annulation, passer son tour, report
- [ ] Job de passage en `MISSED`
- [ ] Tests de récurrence incluant les changements d'heure

**Jalon :** « sortir les poubelles chaque lundi, à tour de rôle » fonctionne de bout
en bout à l'API.

## v0.3 — Compteurs et rendez-vous

- [ ] Compteurs : définitions, événements, état dérivé
- [ ] Rendez-vous : CRUD, participants, réponses
- [ ] Vue fusionnée `/agenda`
- [ ] Fil d'activité

**Jalon :** les quatre besoins du README sont couverts côté serveur.

## v0.4 — Application Android

Voir [MyHousehold-android](https://github.com/overline090/MyHousehold-android).

- [ ] Connexion à une instance (URL du serveur saisie par l'utilisateur)
- [ ] Écran « Aujourd'hui »
- [ ] Tâches, compteurs, agenda
- [ ] Persistance locale Room + file de mutations
- [ ] Synchronisation WorkManager

**Jalon :** premier usage réel par un foyer. C'est ce jalon qui compte : tout ce qui
précède est invérifiable sans lui.

## v0.5 — Agendas externes

- [ ] Import de flux ICS
- [ ] CalDAV avec synchro incrémentale
- [ ] OAuth Google en lecture seule
- [ ] Mode `busyOnly`

## v0.6 — Notifications

- [ ] Rappels configurables
- [ ] Push FCM
- [ ] Push UnifiedPush (distribution hors Play Store)
- [ ] Heures de silence

## v1.0 — Stabilisation

- [ ] Documentation d'installation vérifiée par quelqu'un d'autre que l'auteur
- [ ] Migrations rétrocompatibles garanties
- [ ] Traductions (fr, en)
- [ ] Guide de sauvegarde et de restauration testé
- [ ] Publication F-Droid

**Critère de la 1.0 :** quelqu'un qui ne connaît pas le projet installe le serveur et
l'app en moins d'une heure, en suivant la seule documentation.

## Envisagé, non engagé

| Idée | Note |
|---|---|
| Écriture vers les agendas externes | Risque de destruction de données chez l'utilisateur — prérequis stricts dans `calendar-sync.md` |
| Liste de courses partagée | Très demandé sur ce type d'outil, mais c'est un domaine à part entière |
| Validation des tâches des enfants | `completedBy` prépare déjà le modèle |
| Client web | Le modèle de données et l'API le permettent ; demande des mainteneurs supplémentaires |
| Budget / dépenses partagées | Hors périmètre : des outils dédiés le font déjà bien |
| Client iOS | Aucune compétence disponible dans le projet aujourd'hui |
| Quitter un foyer sans supprimer son compte | Volontairement absent. À reconsidérer seulement si l'usage multi-foyer devient courant (voir les questions ouvertes de `data-model.md`) |

## Non-objectifs

Ces points sont refusés par principe, pas par manque de temps :

- **Pas de service hébergé par le projet.** L'auto-hébergement n'est pas une étape
  transitoire, c'est la finalité.
- **Pas de télémétrie**, même anonyme, même optionnelle.
- **Pas de classement entre membres.** Un outil qui désigne un mauvais élève crée des
  conflits domestiques au lieu d'en résoudre.
- **Pas d'exclusion.** Personne ne peut sortir quelqu'un d'autre d'un foyer. Un
  logiciel n'a pas à arbitrer qui vit sous un toit.
- **Pas de compte obligatoire chez un tiers.** La synchro d'agenda est optionnelle et
  l'app doit être pleinement utilisable sans elle.
