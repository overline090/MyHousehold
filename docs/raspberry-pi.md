# Déploiement sur Raspberry Pi

Le Raspberry Pi est la **cible de référence** du projet : c'est la machine que les
gens ont déjà, qui consomme quelques watts et qui tient dans un placard.

> ⚠️ Les éléments marqués *(à faire)* ne sont pas encore livrés.

## Modèles

| Modèle | Verdict |
|---|---|
| Pi 5, Pi 4 (4 Go+) | ✅ Confortable |
| Pi 4 / Pi 400 (2 Go) | ✅ Cible à tenir : PostgreSQL + Redis + Node y tiennent |
| Pi 3B+ (1 Go) | ⚠️ Fonctionne, mais sans marge. À mesurer avant de le recommander |
| Pi Zero 2 W (512 Mo) | ❌ Insuffisant |

Architecture : **arm64 obligatoire**, donc un système 64 bits. Les images officielles
32 bits (armhf) sont écartées — PostgreSQL 16 et Node 22 y sont pénibles à faire
tenir, et les images Docker arm64 existent pour tout.

## Deux façons d'installer

### 1. Docker Compose sur un système existant *(disponible)*

Pour qui a déjà un Pi qui tourne. Voir [self-hosting.md](self-hosting.md). Les images
doivent être publiées en **multi-architecture** (`linux/amd64` et `linux/arm64`) pour
que la même commande fonctionne sur un PC et sur un Pi *(à faire)*.

### 2. Image « clés en main » *(à faire)*

Une image de carte SD à graver, qui démarre sur l'assistant d'installation : c'est
elle qui permet le pas-à-pas réseau décrit dans
[setup-wizard.md](setup-wizard.md#étape-1--réseau).

Elle contient, en plus de l'application :

- un service système `myhousehold-netsetup` qui pilote les interfaces réseau
  (NetworkManager) et ouvre un point d'accès au premier démarrage ;
- la publication mDNS de `myhousehold.local`, pour ne pas avoir à chercher une
  adresse IP ;
- un partitionnement qui sépare les données (`/data`) du système, afin qu'une mise à
  jour de l'image ne touche pas au foyer.

## Ménager la carte SD

C'est le principal facteur de panne d'un Pi laissé branché des années : les cartes SD
meurent en écriture, et PostgreSQL écrit beaucoup.

Décisions prises en conséquence :

- **Redis sans persistance** — déjà le cas : il ne contient que des jobs en attente,
  tous reconstructibles. Aucune raison d'écrire sur la carte.
- **Journaux en mémoire** (`journald` volatile, `logging driver` borné côté Docker),
  avec une rétention courte.
- **Recommander un SSD USB** pour `/data` dès que le foyer dépasse quelques mois
  d'historique. L'image doit rendre ce déplacement facile et documenté, pas
  acrobatique.
- **La sauvegarde n'est pas optionnelle.** Une carte SD qui meurt sans sauvegarde,
  c'est l'historique du foyer perdu : l'assistant proposera de configurer une
  sauvegarde avant de se terminer.

## Ressources et réglages

PostgreSQL arrive avec des réglages dimensionnés pour un serveur, pas pour un Pi.
L'image fournira une configuration adaptée *(à faire)* : `shared_buffers` modeste,
`max_connections` bas — un foyer, c'est dix personnes et un seul processus applicatif,
pas cent connexions simultanées.

Côté application, deux choses sont déjà dimensionnées pour cette machine :

- **Argon2id** avec 19 Mo de mémoire et 2 itérations : une centaine de millisecondes
  sur un Pi 4, ce qui reste dissuasif pour une attaque hors ligne sans rendre la
  connexion pénible ;
- **les balayages** tournent toutes les heures et tous les quarts d'heure, pas en
  continu, et ne réveillent pas la machine pour rien.

## Mesures à faire avant de promettre quoi que ce soit

Rien de ce qui précède ne remplace une mesure réelle. À faire sur un Pi 4 (2 Go), avec
un foyer de six personnes et un an d'historique simulé :

- empreinte mémoire au repos des trois conteneurs ;
- durée d'un `tasks.materialize` sur cinquante tâches actives ;
- temps de réponse de `GET /occurrences` sur la fenêtre par défaut ;
- volume écrit par jour sur la carte SD ;
- temps de démarrage à froid après coupure de courant.

Ces chiffres manquent aujourd'hui, et tant qu'ils manquent le projet ne promet pas de
performances — il annonce une cible.
