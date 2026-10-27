# Auto-hébergement

> ⚠️ **Le serveur est en v0.4** : il gère les comptes, les statuts et leurs droits,
> le foyer, les tâches des trois sortes (récurrentes, de fond, ponctuelles) et les
> rendez-vous. L'application Android et la partie authentifiée de l'interface web
> restent à écrire ([`roadmap.md`](roadmap.md)). L'installation décrite ici fonctionne,
> mais l'application n'est pas encore utilisable au quotidien. Voir
> [`roadmap.md`](roadmap.md).

## Matériel visé

| Cible | Viable |
|---|---|
| Raspberry Pi 4 / 5 (2 Go+) | ✅ Cible de référence |
| NAS Synology / TrueNAS (Docker) | ✅ |
| VPS 1 vCPU / 1 Go | ✅ |
| Raspberry Pi Zero, 512 Mo | ❌ PostgreSQL + Redis + Node ne tiennent pas |

## Composition

Trois conteneurs : `api` (NestJS), `db` (PostgreSQL 16), `redis` (file de jobs).

```bash
cp .env.example .env        # puis remplir les CHANGEME
docker compose up -d --build
curl http://localhost:3000/health
```

Puis ouvrez **http://localhost:3000/setup** : l'assistant d'installation vous guide
jusqu'au foyer fonctionnel, sans toucher à un terminal.

Les migrations sont appliquées au démarrage du conteneur `api` : une mise à jour
d'image ne demande aucune étape manuelle oubliable.

Deux écoutes :

- **HTTP, `127.0.0.1:3000`** : la machine elle-même et un reverse proxy. L'accès depuis
  Internet passe par un reverse proxy TLS, jamais en direct.
- **HTTPS, port 3443, sur le réseau de la maison** : c'est là que le téléphone se
  connecte. Le certificat est créé au premier démarrage dans le volume `app-data`, et
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
docker run --rm -v myhousehold_app-data:/data -v "$PWD":/sortie alpine \
  tar czf /sortie/donnees.tar.gz -C /data .

# 3. le fichier .env (contient MH_ENCRYPTION_KEY)
# 4. tester la restauration — une sauvegarde jamais restaurée n'est pas une sauvegarde
```

Redis ne nécessite pas de sauvegarde : il ne contient que des jobs en attente, tous
reconstructibles.

## Mise à jour

Le serveur vous prévient : il regarde une fois par jour s'il existe une version plus
récente, et l'administrateur de l'instance la voit dans la zone d'administration
(`GET /api/v1/admin/updates`). Rien n'est envoyé au passage — il lit une page de
publications — et `MH_UPDATE_CHECK=false` coupe ces appels pour qui ne veut aucun
trafic sortant.

```bash
git pull
docker compose up -d --build
```

Les migrations seront toujours **rétrocompatibles d'une version majeure à la
précédente**, afin qu'un serveur mis à jour continue de servir des apps non encore
mises à jour. C'est une contrainte forte mais indispensable : on ne contrôle pas le
moment où chaque membre du foyer met son téléphone à jour.

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
