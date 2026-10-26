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

- [x] Compteurs : définitions, événements, état dérivé jamais stocké *(devenus les tâches de fond, voir la reprise ci-dessous)*
- [x] Rendez-vous : CRUD, participants, réponses, visibilité privée
- [x] Récurrence des rendez-vous déroulée à la lecture, en heure locale
- [x] Vue fusionnée `/agenda`
- [x] Fil d'activité paginé

**Jalon atteint :** les quatre besoins du README sont couverts côté serveur.

## Reprise du modèle (en cours, prioritaire)

Le modèle a été révisé après la v0.3 : un seul foyer par serveur, une seule notion de
tâche, des statuts à droits, pas de points. C'est décidé dans
[`data-model.md`](data-model.md) et contractualisé dans [`api.md`](api.md) ; le code
expose encore le modèle précédent. Cette reprise passe **avant** les versions
ci-dessous, parce que chaque écran écrit sur l'ancien modèle serait à réécrire.

- [x] Modèle de données décidé ([`data-model.md`](data-model.md))
- [x] Contrat d'API décidé, avec la table des différences ([`api.md`](api.md))
- [x] Maquettes de l'app au nouveau modèle, à valider
- [x] Maquettes de la partie authentifiée du web, dont la configuration des statuts
- [x] Foyer unique : suppression du préfixe `/households/:householdId` et du garde
      d'appartenance, remplacé par un garde de droits
- [x] Statuts et droits à la place des rôles, règle du dernier administrateur
- [x] Profil : prénom, nom, date de naissance, photo redimensionnée à l'arrivée
- [ ] Tâches unifiées : `SCHEDULED`, `BACKGROUND`, `ONE_OFF` dans une seule ressource
- [ ] Groupes de tâches, priorités de +3 à −3
- [ ] Les cinq formes de récurrence exposées à la place de la RRULE brute
- [ ] Retrait des points, et des compteurs comme objet distinct
- [x] Migration des rôles en statuts, et d'un serveur multi-foyer vers un seul
- [ ] Migration des compteurs en tâches de fond

**Jalon :** le serveur et l'app parlent le modèle décidé, et une installation en v0.3
se migre sans perte.

## v0.4 — Application Android, utilisable seule (prochaine étape)

Voir [MyHousehold-android](https://github.com/overline090/MyHousehold-android).

- [ ] Maquettes validées avant toute ligne d'interface
- [ ] Écran « Accueil », tâches, tâches de fond, agenda
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
- [x] Interface web ([web-ui.md](web-ui.md)) : application à page unique servie en statique par Nest
- [x] L'assistant d'installation au navigateur, parcours joué de bout en bout dans un vrai navigateur
- [ ] Session par cookie `httpOnly` pour la partie authentifiée
- [ ] Vue « Accueil », tâches et tâches de fond au navigateur
- [ ] Zone d'administration au navigateur : comptes, santé, balayages, mises à jour
**Jalon :** on branche un serveur et on arrive à un foyer fonctionnel sans ouvrir de
terminal.

## v0.6 — Raspberry Pi et distribution

- [ ] Images Docker multi-architecture (arm64 + amd64)
- [ ] Image de carte SD « clés en main », avec configuration réseau au premier démarrage
      ([raspberry-pi.md](raspberry-pi.md))
- [ ] Publication mDNS de `myhousehold.local`
- [ ] Mesures réelles sur Pi 4 (2 Go) : mémoire, durée des balayages, écritures sur carte SD
- [x] Détection des mises à jour **du serveur**, et version d'app attendue relayée au foyer
- [ ] Mise à jour de l'app hors magasin : détection, téléchargement, vérification
      ([updates.md](https://github.com/overline090/MyHousehold-android/blob/main/docs/updates.md))
- [ ] Miroir de l'APK servi par le serveur du foyer

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
| Quitter un foyer sans supprimer son compte | Volontairement absent, et sans objet : un serveur ne sert qu'un foyer |
| Récurrence portée par un groupe de tâches | Repoussé : un groupe est un classement, pas une méta-tâche (voir les questions ouvertes de `data-model.md`) |

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
- **Pas de multi-foyer.** Une machine sert un foyer. Mutualiser plusieurs familles sur
  un serveur ramènerait une frontière d'isolation à défendre, pour un besoin que
  l'auto-hébergement ne crée pas.
- **Pas de points.** Compter les corvées en points suppose qu'on sache ce que vaut une
  vaisselle face à une lessive, et transforme une organisation en comptabilité.
