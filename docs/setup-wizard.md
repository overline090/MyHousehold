# Assistant d'installation

> ⚠️ **Spécification, rien n'est encore écrit.** Les maquettes sont à valider avant
> implémentation. Cette page fixe le déroulé, les contraintes et les points durs.

Objectif : qu'une personne qui vient de brancher un Raspberry Pi arrive à un foyer
fonctionnel sans toucher à un terminal.

## Déroulé

L'assistant est servi par le serveur lui-même. Tant que l'installation n'est pas
terminée, **toutes les routes web redirigent vers `/setup`** ; une fois terminée,
`/setup` répond `404`.

```
0. Bienvenue              langue, et ce que l'assistant va faire
1. Réseau                 Wi-Fi ou Ethernet          (image Raspberry Pi seulement)
2. Reprendre depuis l'app importer une configuration existante, ou continuer à vide
3. Le foyer               nom, fuseau horaire, premier jour de la semaine
4. Premier compte         créé depuis le téléphone, devient administrateur
5. Terminé                adresse du serveur, code d'invitation pour les autres
```

D'autres étapes viendront (agenda, notifications, sauvegardes, mises à jour
automatiques). L'assistant est donc construit comme une **liste d'étapes
déclarées**, chacune sachant dire si elle est applicable, obligatoire et terminée :
en ajouter une ne doit pas demander de retoucher les autres.

## L'état de l'installation vit côté serveur

Une table `server_setup` (une seule ligne) garde l'étape courante, les étapes
franchies et les données saisies. Trois raisons :

1. On change d'appareil en cours de route — l'étape 1 se fait depuis un téléphone
   connecté au point d'accès du Pi, la suite depuis un ordinateur sur le réseau de la
   maison. Un état en session serait perdu.
2. L'étape 4 attend une action sur le téléphone : la page web interroge le serveur.
3. Une coupure de courant en milieu d'installation doit reprendre où elle en était.

## Qui a le droit d'installer

L'assistant est par définition **non authentifié** : aucun compte n'existe encore.
C'est le moment le plus vulnérable de la vie du serveur — qui atteint `/setup` le
premier devient administrateur du foyer.

Trois protections, cumulatives :

1. **Réseau privé uniquement.** Les requêtes venant d'une adresse publique sont
   refusées (`403 SETUP_REMOTE_FORBIDDEN`). Un Pi exposé par mégarde sur Internet
   n'est pas installable depuis l'extérieur.
2. **Jeton d'installation.** Généré au premier démarrage, écrit dans les journaux et
   dans `/data/setup-token.txt`. Il n'est exigé que si la protection réseau ne peut
   pas s'appliquer (reverse proxy qui masque l'adresse d'origine), auquel cas le
   serveur le dit explicitement plutôt que de laisser passer.
3. **Fenêtre d'installation.** Si aucun compte n'est créé dans les 24 h suivant le
   premier démarrage, l'assistant se verrouille et il faut redémarrer le serveur pour
   le réarmer. Un Pi oublié sur une étagère ne reste pas éternellement adoptable.

## Étape 1 — Réseau

**Cette étape n'existe que sur l'image Raspberry Pi**, et c'est le point dur de tout
l'assistant : configurer le Wi-Fi depuis une page web suppose que le serveur pilote
les interfaces réseau de la machine. Un conteneur Docker ne peut pas le faire de
façon portable, et ne doit pas le pouvoir.

Conséquence : la configuration réseau n'est **pas** dans le serveur, mais dans un
petit service système de l'image Pi (`myhousehold-netsetup`), que le serveur
interroge par socket Unix. Sur une installation Docker classique, l'étape est
déclarée non applicable et l'assistant la saute — le réseau est déjà configuré,
sinon la page ne s'afficherait pas.

Déroulé sur le Pi, premier démarrage :

1. Aucun réseau connu → le Pi ouvre son propre point d'accès `MyHousehold-setup`,
   mot de passe affiché sur un autocollant ou dans la documentation.
2. On s'y connecte avec un téléphone, la page d'installation s'ouvre
   (portail captif, sinon `http://192.168.4.1`).
3. Choix : **Ethernet** (si un câble est détecté, c'est proposé en premier — rien à
   configurer) ou **Wi-Fi** (liste des réseaux vus, mot de passe).
4. Le Pi bascule sur le réseau choisi, le point d'accès disparaît. **On perd donc la
   connexion** : la page prévient avant, et indique la nouvelle adresse
   (`http://myhousehold.local`, via mDNS) ainsi que l'adresse IP de secours.
5. Si la connexion échoue, le point d'accès se rouvre au bout de 90 secondes. Sans
   ce repli, une faute de frappe dans le mot de passe Wi-Fi rend le Pi
   inaccessible et impose de ressortir la carte SD.

## Étape 2 — Reprendre la configuration de l'app

L'application est utilisable **sans serveur** (voir
[standalone.md](https://github.com/overline090/MyHousehold-android/blob/main/docs/standalone.md)).
Beaucoup de gens l'auront donc utilisée seuls avant d'installer un serveur : leur
foyer, leurs tâches et leurs compteurs existent déjà sur le téléphone. Les leur faire
ressaisir serait absurde.

```
Déjà une configuration dans l'app ?   [ Oui, l'importer ]  [ Non, continuer ]
```

Si oui : la page affiche un code d'appariement et un QR code. Dans l'app,
*Réglages → Connecter un serveur*, on scanne, et l'app **pousse** sa configuration
locale : nom du foyer, fuseau, tâches, compteurs, rendez-vous, historique.

L'assistant affiche ensuite un **récapitulatif de ce qui a été repris et de ce qui
manque** — un foyer utilisé seul n'a ni membres, ni rôles, ni invitations. Les étapes
suivantes sont pré-remplies et, pour celles que l'import a déjà couvertes, marquées
comme telles : on les passe en revue au lieu de les refaire.

L'import réutilise les identifiants générés par l'app : les UUID sont générés côté
client depuis le début, précisément pour que les données puissent changer de maison
sans perdre leur identité.

## Étape 3 — Le foyer

Nom, fuseau horaire, premier jour de la semaine. Le fuseau est proposé d'après celui
du système, le nom est pré-rempli si l'étape 2 a importé quelque chose.

Le fuseau est demandé ici et pas plus tard parce qu'il est **structurant** : c'est lui
qui fait référence pour calculer les échéances des tâches.

## Étape 4 — Premier compte, depuis le téléphone

Le premier compte créé devient administrateur de l'instance. Il **doit** être créé
depuis l'app, pas depuis la page web.

Pourquoi : l'app est de toute façon nécessaire pour utiliser le foyer au quotidien, et
créer le compte depuis le téléphone garantit qu'il est appairé, qu'il reçoit les
notifications et que son propriétaire sait s'y connecter. Un compte administrateur
créé au clavier sur un ordinateur, puis jamais rattaché à un téléphone, est le
scénario qui finit par un foyer dont personne ne peut plus rien administrer.

```
┌─────────────────────────────────────────┐
│  Installez MyHousehold sur votre        │
│  téléphone, puis scannez ce code        │
│                                         │
│        [ QR ]      ou saisissez         │
│                     K7MP-4RQX           │
│                                         │
│  ⏳ En attente du téléphone…            │
└─────────────────────────────────────────┘
```

Le QR contient l'adresse du serveur et un jeton d'appariement à usage unique, valable
15 minutes. L'app crée le compte (nom, e-mail, mot de passe) et le serveur le marque
`isServerAdmin`. La page web le détecte et passe à l'étape suivante.

Si le téléphone n'est pas disponible, un lien discret permet de créer le compte depuis
le navigateur : un blocage dur serait pire que le risque qu'il évite, par exemple pour
quelqu'un sans téléphone Android sous la main. L'assistant dit alors clairement ce que
cela implique.

## Étape 5 — Terminé

Affiche l'adresse du serveur, rappelle de la noter, propose un code d'invitation pour
les autres membres du foyer, et **ferme les inscriptions libres** : à partir de là, on
rejoint le foyer sur invitation. C'est ce que `MH_ALLOW_REGISTRATION=false` fait
aujourd'hui à la main dans le fichier d'environnement.

Propose aussi, sans les imposer : configurer une sauvegarde, connecter un agenda,
activer les mises à jour automatiques. Ces étapes deviendront des étapes de
l'assistant quand elles existeront.

## API

Routes hors de `/api/v1`, puisqu'elles précèdent l'existence de tout compte.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/setup/state` | Étapes, laquelle est courante, ce qui est applicable |
| `POST` | `/setup/network` | Appliquer une configuration réseau (image Pi) |
| `GET` | `/setup/network/scan` | Réseaux Wi-Fi détectés |
| `POST` | `/setup/pairing` | Créer un code d'appariement, rend code + QR |
| `GET` | `/setup/pairing/:code` | État de l'appariement (attente, utilisé, expiré) |
| `POST` | `/setup/household` | Nom, fuseau, premier jour |
| `POST` | `/setup/import` | Appelé **par l'app** : pousse sa configuration locale |
| `POST` | `/setup/claim` | Appelé **par l'app** : crée le compte administrateur |
| `POST` | `/setup/complete` | Verrouille l'assistant |

Toutes refusent une adresse source publique, et répondent `409 SETUP_ALREADY_DONE`
une fois l'installation terminée.

## Points à trancher

1. **Le mot de passe du point d'accès** doit-il être fixe (imprimable dans la
   documentation, donc connu de tous) ou dérivé du numéro de série du Pi (unique mais
   à aller lire) ? Proposition : dérivé, et affiché au démarrage sur la sortie série
   et dans un fichier de la partition de démarrage, lisible depuis n'importe quel
   ordinateur ayant la carte SD.
2. **Reprise d'une app déjà connectée à un autre serveur** : refus, ou migration ?
   Proposition : refus explicite en v1, la migration entre serveurs est un sujet à
   part entière.
3. **Plusieurs foyers sur une instance** : l'assistant n'en crée qu'un. Créer les
   suivants se fait depuis l'app, comme aujourd'hui.
