# Auto-hébergement

> ⚠️ **Document prospectif.** Le serveur n'est pas encore implémenté : rien de ce qui
> suit n'est installable aujourd'hui. Cette page fixe la cible d'installation pour
> que l'implémentation s'y conforme, et sert de référence pour discuter des choix de
> déploiement dès maintenant.

## Matériel visé

| Cible | Viable |
|---|---|
| Raspberry Pi 4 / 5 (2 Go+) | ✅ Cible de référence |
| NAS Synology / TrueNAS (Docker) | ✅ |
| VPS 1 vCPU / 1 Go | ✅ |
| Raspberry Pi Zero, 512 Mo | ❌ PostgreSQL + Redis + Node ne tiennent pas |

## Composition prévue

Trois conteneurs : `api` (NestJS), `db` (PostgreSQL 16), `redis` (file de jobs).

```
docker compose up -d        # démarrage
docker compose exec api npx prisma migrate deploy
```

## Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | ✅ | Connexion PostgreSQL |
| `REDIS_URL` | ✅ | File de jobs |
| `MH_JWT_SECRET` | ✅ | Signature des tokens. 32 octets aléatoires |
| `MH_ENCRYPTION_KEY` | ✅ | Chiffrement des identifiants d'agenda. 32 octets |
| `MH_PUBLIC_URL` | ✅ | URL publique, utilisée pour le callback OAuth |
| `MH_ALLOW_REGISTRATION` | | `false` après la création des comptes du foyer |
| `MH_DEFAULT_TIMEZONE` | | `Europe/Paris` par défaut |
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

Trois choses à sauvegarder, et la troisième est souvent oubliée :

```bash
# 1. base de données
docker compose exec -T db pg_dump -U myhousehold myhousehold | gzip > backup.sql.gz

# 2. le fichier .env (contient MH_ENCRYPTION_KEY)
# 3. tester la restauration — une sauvegarde jamais restaurée n'est pas une sauvegarde
```

Redis ne nécessite pas de sauvegarde : il ne contient que des jobs en attente, tous
reconstructibles.

## Mise à jour

```bash
docker compose pull
docker compose up -d
docker compose exec api npx prisma migrate deploy
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
| Tâches non générées | Redis injoignable, ou job `tasks.materialize` en échec — voir `/health` |
| Échéances décalées d'une heure | `timezone` du foyer mal réglé, ou conteneur en UTC avec une conversion manquante |
| Agenda qui ne se met pas à jour | Délai normal des flux ICS (8 à 24 h), ou `lastError` sur le compte |
| Déconnexions répétées de l'app | `MH_JWT_SECRET` qui change à chaque redémarrage (valeur non persistée) |
