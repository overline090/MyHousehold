# Auto-hébergement

Un serveur sert un foyer. Il s'installe en une commande, avec Docker (recommandé)
ou sans, et se met à jour seul, la nuit.

## Matériel visé

| Cible | Viable |
|---|---|
| Raspberry Pi 4 / 5 (2 Go+) | ✅ Cible de référence |
| NAS Synology / TrueNAS (Docker) | ✅ |
| VPS 1 vCPU / 1 Go | ✅ |
| Raspberry Pi Zero, 512 Mo | ❌ PostgreSQL + Redis + Node ne tiennent pas |

## Installation

```bash
curl -fsSLO https://github.com/overline090/MyHousehold/releases/latest/download/installer.sh
less installer.sh                    # il s'exécute en root : lisez-le
sudo bash installer.sh               # Docker, dans /opt/myhousehold
sudo bash installer.sh --classique   # sans Docker
```

Options : `--dossier <chemin>` (Docker), `--version <x.y.z>`, `--sans-maj` (sans les
mises à jour automatiques). Relancé sur une installation existante, l'installeur garde
les secrets et les données.

Puis ouvrez **http://localhost:3000/setup** : l'assistant d'installation vous guide
jusqu'au foyer fonctionnel, sans toucher à un terminal.

### Avec Docker

L'installeur télécharge le `docker-compose.yml` de la version, crée un `.env` aux
secrets aléatoires et démarre quatre conteneurs : `api` (l'image
`ghcr.io/overline090/myhousehold`, amd64 et arm64), `db` (PostgreSQL 16), `redis` (file
de jobs) et `maj` (l'outil de mise à jour, voir plus bas). À la main, c'est :

```bash
mkdir -p /opt/myhousehold && cd /opt/myhousehold
curl -fsSLO https://github.com/overline090/MyHousehold/releases/latest/download/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/overline090/MyHousehold/main/.env.example
# remplir les CHANGEME, et ajouter MH_VERSION=<version>, MH_DOSSIER=/opt/myhousehold,
# COMPOSE_PROFILES=maj (sans cette ligne, pas de mises à jour automatiques)
docker compose up -d
```

L'image applique les migrations à chaque démarrage : une nouvelle version ne demande
aucune étape à la main. Le `docker-compose.yml` à la racine du dépôt, lui, construit
l'image depuis les sources : il sert au développement.

### Sans Docker (installation classique)

Sur Debian, Ubuntu ou Raspberry Pi OS 64 bits, avec **Node.js 22** déjà installé.
L'installeur ajoute PostgreSQL, Redis et jq, crée l'utilisateur système
`myhousehold`, la base et ses secrets, et installe :

| Quoi | Où |
|---|---|
| Le serveur, une version par dossier | `/opt/myhousehold/versions/<x.y.z>`, `/opt/myhousehold/actuelle` désigne celle qui tourne |
| La configuration et les secrets | `/etc/myhousehold/myhousehold.env` |
| Les données (photos, images, certificat, sauvegardes) | `/var/lib/myhousehold` |
| Le service | `myhousehold.service` (migrations à chaque démarrage) |
| Les mises à jour | `myhousehold-maj.timer`, toutes les cinq minutes |

L'archive téléchargée est vérifiée par sa somme SHA-256, publiée avec la version.

Deux écoutes :

- **HTTP, `127.0.0.1:3000`** : la machine elle-même et un reverse proxy. L'accès depuis
  Internet passe par un reverse proxy TLS, jamais en direct.
- **HTTPS, port 3443, sur le réseau de la maison** : c'est là que le téléphone se
  connecte. Le certificat est créé au premier démarrage dans le dossier de données, et
  l'app retient son **empreinte** : le perdre oblige chaque téléphone à revérifier le
  serveur. Il fait partie de la sauvegarde.

Le serveur tourne sur le **réseau de l'hôte** (`network_mode: host`) : c'est ce qui lui
permet de s'annoncer sur le Wi-Fi (mDNS, `_myhousehold._tcp`) et de connaître
l'adresse de la machine pour la mettre dans son QR code. PostgreSQL et Redis sont donc
publiés sur `127.0.0.1` (ports 5432 et 6379) : ils doivent être libres sur la machine.
Un pare-feu doit laisser passer le port **3443/tcp** et **5353/udp** (mDNS) depuis le
réseau local.

## Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | Mot de passe de la base, lu aussi par le conteneur `db` |
| `DATABASE_URL` | ✅ | Connexion PostgreSQL. Avec docker-compose, composée automatiquement |
| `REDIS_URL` | ✅ | File de jobs |
| `MH_JWT_SECRET` | ✅ | Signature des tokens. 32 octets aléatoires |
| `MH_ENCRYPTION_KEY` | ✅ | Chiffrement des identifiants d'agenda. 32 octets |
| `MH_PUBLIC_URL` | ✅ | URL publique, utilisée pour le callback OAuth |
| `MH_ALLOW_REGISTRATION` | | `false` après la création des comptes du foyer |
| `MH_DEFAULT_TIMEZONE` | | `Europe/Paris` par défaut |
| `MH_HTTP_HOST` | | Adresse d'écoute HTTP. `127.0.0.1` avec docker-compose |
| `MH_HTTPS_PORT` | | Port HTTPS du réseau local, `3443` par défaut |
| `MH_MDNS` | | `false` coupe l'annonce sur le Wi-Fi |
| `MH_UPDATE_CHECK` | | `false` coupe la vérification des mises à jour, donc tout appel sortant |
| `MH_RELEASES_URL` / `MH_APP_RELEASES_URL` | | Où lire les versions publiées. À changer pour un miroir interne |
| `MH_GOOGLE_CLIENT_ID` / `_SECRET` | | Seulement pour la synchro Google |
| `MH_FCM_SERVICE_ACCOUNT` | | Chemin du fichier de compte de service, pour le push |

Génération des secrets :

```bash
openssl rand -base64 32
```

**`MH_ENCRYPTION_KEY` est irremplaçable** : la perdre rend les identifiants d'agenda
déjà enregistrés indéchiffrables, et il faudra reconnecter chaque compte. À
sauvegarder séparément du dump de base — les garder ensemble annule l'intérêt du
chiffrement.

Après la création des comptes des membres, passer `MH_ALLOW_REGISTRATION=false` :
sans cela, un serveur exposé sur Internet accepte les inscriptions de n'importe qui.

Au premier démarrage, le serveur écrit dans ses journaux un **jeton d'installation**
et l'adresse de l'assistant. Le jeton n'est exigé que si un reverse proxy masque
l'adresse d'origine des visiteurs ; sinon, l'assistant n'accepte que le réseau local.
Passé 24 h sans compte créé, il se verrouille et un redémarrage le réarme.

**Le premier compte créé devient administrateur de l'instance** (`isServerAdmin`),
ce qui lui donne accès à `/api/v1/admin/users` : lister les comptes et en supprimer.
C'est le seul moyen de supprimer le compte de quelqu'un qui n'est plus joignable —
il n'y a pas d'exclusion dans MyHousehold. Créez donc votre compte en premier, avant
d'inviter le reste du foyer.

## Exposition sur Internet

Nécessaire seulement pour l'accès hors du domicile et pour le callback OAuth Google.

**Recommandé : un reverse proxy TLS** (Caddy obtient un certificat automatiquement).
L'API ne doit jamais être exposée en HTTP simple : les tokens circuleraient en clair.

Sans nom de domaine, trois options par ordre de préférence :

1. **VPN (WireGuard / Tailscale)** — le plus sûr, rien n'est exposé publiquement.
   Suffisant si Google Calendar n'est pas utilisé.
2. **Tunnel** (Cloudflare Tunnel, ngrok) — pas d'ouverture de port, mais le trafic
   passe par un tiers.
3. **Redirection de port + DNS dynamique** — fonctionne, mais expose directement le
   serveur : à réserver à qui sait maintenir un service public à jour.

## Sauvegardes

Quatre choses à sauvegarder, et les deux dernières sont souvent oubliées :

```bash
# 1. base de données
docker compose exec -T db pg_dump -U myhousehold myhousehold | gzip > backup.sql.gz

# 2. le volume de données : les photos de profil sont des fichiers, pas
#    des colonnes — un dump SQL seul rendrait le foyer sans visages
# (chaque mise à jour en fait déjà une, dans sauvegardes/ du dossier de données)
docker run --rm -v myhousehold_app-data:/data -v "$PWD":/sortie alpine \
  tar czf /sortie/donnees.tar.gz -C /data .

# 3. le fichier .env (contient MH_ENCRYPTION_KEY)
# 4. tester la restauration — une sauvegarde jamais restaurée n'est pas une sauvegarde
```

Redis ne nécessite pas de sauvegarde : il ne contient que des jobs en attente, tous
reconstructibles.

## Mise à jour

**Automatique, par défaut.** Chaque nuit à 4 h, si une nouvelle version est publiée,
elle s'installe seule. Tout se règle dans **Administration › Serveur** : seule ou non,
l'heure, les versions majeures, et « Mettre à jour maintenant ».

Le serveur ne se met pas à jour lui-même : il faudrait lui confier la machine entière.
C'est un **outil à part** qui s'en charge — le conteneur `maj` avec Docker, le
minuteur `myhousehold-maj.timer` sinon. Il passe toutes les cinq minutes et ne parle
au serveur que par deux fichiers du dossier de données :

- `mises-a-jour/politique.json`, écrit par le serveur : les réglages de la page ;
- `mises-a-jour/etat.json`, écrit par l'outil : son dernier passage, la dernière mise
  à jour et son résultat, que la page affiche.

Une mise à jour se fait en quatre temps :

1. **sauvegarde de la base** dans `sauvegardes/` du dossier de données (les cinq
   dernières sont gardées) ;
2. **nouvelle version** : nouvelle image (Docker) ou nouvelle archive vérifiée par sa
   somme SHA-256 (classique) ;
3. **contrôle de santé** : le serveur doit répondre, dans la nouvelle version, en
   moins de quatre minutes ;
4. sinon, **retour à l'ancienne version**, et la page le dit. Une version qui a échoué
   ne se réessaie pas seule : elle attend « Mettre à jour maintenant ».

Une **version majeure** n'est installée seule que si la case « Versions majeures
aussi » est cochée ; sinon, elle attend une demande. Les migrations restent
**rétrocompatibles d'une version majeure à la précédente** : un retour en arrière
retrouve une base qu'il sait lire, et un serveur mis à jour continue de servir les
téléphones pas encore mis à jour.

**Ce que l'outil peut faire.** Avec Docker, il a accès au socket Docker, donc à la
machine : c'est pourquoi il vit à part du serveur, qui, lui, n'y a pas accès. Pour s'en
passer, retirez `maj` de `COMPOSE_PROFILES` dans `.env` (ou installez avec
`--sans-maj`, ou désactivez `myhousehold-maj.timer`) ; la page donne alors la commande à
lancer :

```bash
cd /opt/myhousehold && docker compose pull && docker compose up -d
```

`MH_UPDATE_CHECK=false` coupe tout appel sortant du serveur ; l'outil, lui, lit la page
des publications (`MH_RELEASES_URL`) à chaque passage.

### Venir d'une installation par les sources

Un serveur installé avec `git pull && docker compose up -d --build` passe aux images
publiées en lançant l'installeur dans le même dossier (`--dossier <dossier du dépôt>`) :
il garde le `.env`, et les volumes, nommés d'après le dossier, restent les mêmes si ce
dossier s'appelle `MyHousehold`. Sauvegardez avant.

## Configurer OAuth Google (optionnel)

À faire une fois, dans la console Google Cloud :

1. Créer un projet.
2. Activer l'API Google Calendar.
3. Écran de consentement OAuth : type « externe », ajouter chaque membre du foyer en
   **utilisateur test** (une application en mode test ne nécessite pas de validation
   Google, et autorise jusqu'à 100 utilisateurs — largement suffisant).
4. Identifiants → « ID client OAuth » → application Web.
5. URI de redirection autorisée : `https://<votre-domaine>/calendars/google/callback`.
6. Reporter l'ID et le secret dans `.env`, redémarrer.

Si c'est trop lourd, les flux ICS ne demandent qu'un copier-coller d'URL et couvrent
le besoin principal (voir [`calendar-sync.md`](calendar-sync.md)).

## Diagnostic

```bash
curl http://localhost:3000/health   # base, redis, dernière exécution des jobs
docker compose logs -f api
```

| Symptôme | Piste |
|---|---|
| Tâches non générées | Redis injoignable, ou job `tasks.materialize` en échec — voir `/health`, puis relancer avec `POST /api/v1/admin/jobs/tasks.materialize/run` |
| Échéances décalées d'une heure | `timezone` du foyer mal réglé, ou conteneur en UTC avec une conversion manquante |
| Agenda qui ne se met pas à jour | Délai normal des flux ICS (8 à 24 h), ou `lastError` sur le compte |
| Déconnexions répétées de l'app | `MH_JWT_SECRET` qui change à chaque redémarrage (valeur non persistée) |
| Refus de démarrer avec « Configuration invalide » | Un secret manquant ou trop court dans `.env` ; le message nomme la variable |
| `429` à l'inscription du cinquième membre | Limite de 20 inscriptions par heure et par IP ; attendre, ou créer les comptes depuis le serveur |
| `404` sur `/api/v1/admin/users` | Votre compte n'est pas administrateur de l'instance. Le premier compte créé l'est ; la zone répond 404 et non 403 pour ne pas révéler son existence |
| Un foyer a disparu | Son dernier membre a supprimé son compte : un foyer sans successeur possible est supprimé avec lui |
