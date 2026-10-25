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
- [x] `scripts/smoke.sh` : parcours de bout en bout, 76 vérifications
- [ ] Tests d'intégration automatisés (Testcontainers) en remplacement du script

**Jalon atteint :** deux comptes peuvent rejoindre un même foyer, avec des rôles
distincts et une isolation vérifiée.

## v0.2 — Tâches (faite)

- [x] CRUD des définitions avec RRULE, et validation des règles aberrantes
- [x] Job de matérialisation des occurrences (−14 / +60 jours glissants)
- [x] Assignation : `FIXED`, `ROTATION` déterministe, `ANYONE`
- [x] Complétion, annulation, passer son tour, réassignation, report
- [x] Job de passage en `MISSED`, et déclenchement manuel des balayages
- [x] Tests de récurrence incluant les changements d'heure

**Jalon atteint :** « sortir les poubelles chaque lundi, à tour de rôle » fonctionne
de bout en bout à l'API.

## v0.3 — Compteurs et rendez-vous (faite)

- [x] Compteurs : définitions, événements, état dérivé jamais stocké
- [x] Rendez-vous : CRUD, participants, réponses, visibilité privée
- [x] Récurrence des rendez-vous déroulée à la lecture, en heure locale
- [x] Vue fusionnée `/agenda`
- [x] Fil d'activité paginé

**Jalon atteint :** les quatre besoins du README sont couverts côté serveur.

## v0.4 — Application Android, utilisable seule (prochaine étape)

Voir [MyHousehold-android](https://github.com/overline090/MyHousehold-android).

- [ ] Maquettes validées avant toute ligne d'interface
- [ ] Écran « Aujourd'hui », tâches, compteurs, agenda
- [ ] Persistance locale Room + file de mutations
- [ ] **Mode sans serveur** : l'app s'installe et s'utilise seule
      ([standalone.md](https://github.com/overline090/MyHousehold-android/blob/main/docs/standalone.md))
- [ ] Moteur de récurrence en Kotlin, validé par les vecteurs de test partagés du serveur
- [ ] Connexion à une instance, et adoption d'un serveur avec reprise des données locales
- [ ] Synchronisation WorkManager

**Jalon :** premier usage réel par un foyer, **sans qu'un serveur soit nécessaire**.
C'est ce jalon qui compte : tout ce qui précède est invérifiable sans lui.

## v0.5 — Interface web et assistant d'installation (en cours)

- [x] Maquettes validées avant toute ligne d'interface
- [x] Assistant d'installation côté serveur ([setup-wizard.md](setup-wizard.md)) : état, étapes, appariement
- [x] Protections de l'assistant : réseau local, jeton derrière un proxy, fenêtre de 24 h
- [x] Reprise de la configuration depuis l'app (étape 2), appliquée à la création du compte
- [x] Premier compte créé depuis le téléphone, par appariement, administrateur d'office
- [x] Fermeture des inscriptions libres à la fin de l'installation
- [ ] Interface web ([web-ui.md](web-ui.md)) : session par cookie, application à page unique servie par Nest
- [ ] Vue « Aujourd'hui », tâches et compteurs au navigateur
- [ ] Zone d'administration : comptes, santé, balayages

**Jalon :** on branche un serveur et on arrive à un foyer fonctionnel sans ouvrir de
terminal.

## v0.6 — Raspberry Pi et distribution

- [ ] Images Docker multi-architecture (arm64 + amd64)
- [ ] Image de carte SD « clés en main », avec configuration réseau au premier démarrage
      ([raspberry-pi.md](raspberry-pi.md))
- [ ] Publication mDNS de `myhousehold.local`
- [ ] Mesures réelles sur Pi 4 (2 Go) : mémoire, durée des balayages, écritures sur carte SD
- [ ] Mise à jour de l'app hors magasin : détection, téléchargement, vérification
      ([updates.md](https://github.com/overline090/MyHousehold-android/blob/main/docs/updates.md))

## v0.7 — Agendas externes

- [ ] Import de flux ICS
- [ ] CalDAV avec synchro incrémentale
- [ ] OAuth Google en lecture seule
- [ ] Mode `busyOnly`

## v0.8 — Notifications

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
- [ ] Sauvegarde configurable depuis l'assistant d'installation

**Critère de la 1.0 :** quelqu'un qui ne connaît pas le projet installe le serveur et
l'app en moins d'une heure, en suivant la seule documentation.

## Envisagé, non engagé

| Idée | Note |
|---|---|
| Mode « écran de cuisine » | Affichage permanent en gros caractères de la vue « Aujourd'hui ». Peu de travail une fois l'interface web faite |
| Fusion de deux foyers déjà peuplés | Conflits d'identité à résoudre (deux « Marie », deux tâches « poubelles »). Hors sujet pour une installation |
| Migration d'un serveur vers un autre | Distinct de l'adoption d'un serveur neuf, et plus risqué |
| Écriture vers les agendas externes | Risque de destruction de données chez l'utilisateur — prérequis stricts dans `calendar-sync.md` |
| Liste de courses partagée | Très demandé sur ce type d'outil, mais c'est un domaine à part entière |
| Validation des tâches des enfants | `completedBy` prépare déjà le modèle |
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
