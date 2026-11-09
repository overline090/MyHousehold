#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# MyHousehold — installer le serveur du foyer.
#
#   curl -fsSLO https://github.com/overline090/MyHousehold/releases/latest/download/installer.sh
#   less installer.sh            # lisez-le : il va s'exécuter en root
#   sudo bash installer.sh       # Docker (recommandé)
#   sudo bash installer.sh --classique   # sans Docker : Node, PostgreSQL, Redis sur la machine
#
# Options : --dossier <chemin>   (Docker : /opt/myhousehold)
#           --version <x.y.z>    (par défaut : la dernière publiée)
#           --sans-maj           sans les mises à jour automatiques
#
# Il génère les secrets, démarre le serveur et l'outil de mise à jour,
# puis donne l'adresse de l'assistant d'installation. Relancé sur une
# installation existante, il ne touche ni aux secrets ni aux données.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DEPOT="overline090/MyHousehold"
MODE=docker
DOSSIER=/opt/myhousehold
VERSION=""
MAJ=1

while [ $# -gt 0 ]; do
  case "$1" in
    --classique) MODE=classique ;;
    --docker) MODE=docker ;;
    --dossier) DOSSIER="$2"; shift ;;
    --version) VERSION="${2#v}"; shift ;;
    --sans-maj) MAJ=0 ;;
    -h | --help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
  shift
done

dire() { printf '\n\033[1m%s\033[0m\n' "$*"; }
echec() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
secret() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }
mot_de_passe() { head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32; }

[ "$(id -u)" -eq 0 ] || echec "Lancez l'installeur en root : sudo bash installer.sh"
command -v curl >/dev/null || echec "curl est nécessaire."

if [ -z "$VERSION" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/$DEPOT/releases/latest" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n1)"
  [ -n "$VERSION" ] || echec "Impossible de lire la dernière version publiée."
fi
TELECHARGER="${MH_TELECHARGER:-https://github.com/$DEPOT/releases/download/v$VERSION}"
ADRESSE_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
ADRESSE_IP="${ADRESSE_IP:-localhost}"

attendre_sante() {
  for _ in $(seq 1 90); do
    curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

fin() {
  dire "MyHousehold $VERSION est installé."
  cat <<EOF

  Ouvrez l'assistant d'installation, sur cette machine :
      http://localhost:3000/setup
  ou depuis un autre appareil de la maison :
      https://$ADRESSE_IP:3443/setup   (certificat du serveur : le navigateur demande une confirmation)

  Mises à jour automatiques : $([ "$MAJ" = 1 ] && echo "actives, la nuit à 4 h — réglables dans Administration › Serveur" || echo "désactivées")
  Sauvegardez $1 : il contient les secrets du serveur.
EOF
}

# ── Docker ───────────────────────────────────────────────────────────

installer_docker() {
  command -v docker >/dev/null || echec "Docker n'est pas installé : https://docs.docker.com/engine/install/ (ou relancez avec --classique)."
  docker compose version >/dev/null 2>&1 || echec "Le greffon Docker Compose manque (paquet docker-compose-plugin)."

  mkdir -p "$DOSSIER"
  cd "$DOSSIER"
  dire "Téléchargement de la configuration ($VERSION)…"
  curl -fsSL -o docker-compose.yml "$TELECHARGER/docker-compose.yml"

  if [ ! -f .env ]; then
    dire "Création des secrets…"
    umask 077
    cat > .env <<EOF
# MyHousehold — créé par installer.sh le $(date +%F). À sauvegarder : sans
# MH_ENCRYPTION_KEY, les agendas connectés deviennent illisibles.
NODE_ENV=production
PORT=3000
POSTGRES_PASSWORD=$(mot_de_passe)
MH_JWT_SECRET=$(secret)
MH_ENCRYPTION_KEY=$(secret)
MH_PUBLIC_URL=https://$ADRESSE_IP:3443
MH_ALLOW_REGISTRATION=true
MH_DEFAULT_TIMEZONE=$(cat /etc/timezone 2>/dev/null || timedatectl show -p Timezone --value 2>/dev/null || echo Europe/Paris)
MH_UPDATE_CHECK=true
MH_EXPOSE_DOCS=false
# La version installée : l'outil de mise à jour la change.
MH_VERSION=$VERSION
# Le chemin absolu de ce dossier, pour l'outil de mise à jour.
MH_DOSSIER=$DOSSIER
COMPOSE_PROFILES=$([ "$MAJ" = 1 ] && echo maj)
EOF
    umask 022
  else
    dire "Installation existante : les secrets et les données sont gardés."
    grep -q '^MH_DOSSIER=' .env || echo "MH_DOSSIER=$DOSSIER" >> .env
    grep -q '^MH_VERSION=' .env && sed -i "s|^MH_VERSION=.*|MH_VERSION=$VERSION|" .env || echo "MH_VERSION=$VERSION" >> .env
    if [ "$MAJ" = 1 ] && ! grep -q '^COMPOSE_PROFILES=.*maj' .env; then
      sed -i '/^COMPOSE_PROFILES=/d' .env
      echo "COMPOSE_PROFILES=maj" >> .env
    fi
  fi

  dire "Démarrage…"
  docker compose up -d --pull missing
  attendre_sante || echec "Le serveur ne répond pas. Journal : cd $DOSSIER && docker compose logs api"
  fin "$DOSSIER/.env"
}

# ── Installation classique ───────────────────────────────────────────

installer_classique() {
  command -v systemctl >/dev/null || echec "systemd est nécessaire pour l'installation classique."
  local arch
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echec "Architecture $(uname -m) non prise en charge (64 bits seulement)." ;;
  esac

  if command -v apt-get >/dev/null; then
    dire "Paquets nécessaires (PostgreSQL, Redis, jq)…"
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql redis-server jq curl ca-certificates openssl >/dev/null
  fi
  for c in psql redis-server jq; do command -v "$c" >/dev/null || echec "$c manque : installez PostgreSQL, Redis et jq."; done
  command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] \
    || echec "Node.js 22 ou plus est nécessaire : https://nodejs.org/fr/download (paquet « nodejs » de NodeSource)."

  local racine=/opt/myhousehold donnees=/var/lib/myhousehold conf=/etc/myhousehold
  id myhousehold >/dev/null 2>&1 || useradd --system --home "$donnees" --shell /usr/sbin/nologin myhousehold
  mkdir -p "$racine/versions" "$donnees" "$conf"
  chown myhousehold: "$racine" "$donnees"

  local nom="myhousehold-server-$VERSION-linux-$arch.tar.gz" tmp
  tmp="$(mktemp -d)"
  dire "Téléchargement de MyHousehold $VERSION ($arch)…"
  curl -fsSL -o "$tmp/$nom" "$TELECHARGER/$nom"
  curl -fsSL -o "$tmp/$nom.sha256" "$TELECHARGER/$nom.sha256"
  [ "$(sha256sum "$tmp/$nom" | awk '{print $1}')" = "$(awk '{print $1}' "$tmp/$nom.sha256")" ] || echec "Somme SHA-256 incorrecte : téléchargement corrompu."
  mkdir -p "$racine/versions/$VERSION"
  tar -xzf "$tmp/$nom" -C "$racine/versions/$VERSION" --strip-components=1
  chown -R myhousehold: "$racine/versions/$VERSION"
  ln -sfn "versions/$VERSION" "$racine/actuelle"
  rm -rf "$tmp"

  if [ ! -f "$conf/myhousehold.env" ]; then
    dire "Base de données et secrets…"
    local mdp
    mdp="$(mot_de_passe)"
    su postgres -c "psql -qtc \"SELECT 1 FROM pg_roles WHERE rolname='myhousehold'\"" | grep -q 1 \
      || su postgres -c "psql -qc \"CREATE ROLE myhousehold LOGIN PASSWORD '$mdp'\""
    su postgres -c "psql -qtc \"SELECT 1 FROM pg_database WHERE datname='myhousehold'\"" | grep -q 1 \
      || su postgres -c "createdb -O myhousehold myhousehold"
    su postgres -c "psql -qc \"ALTER ROLE myhousehold PASSWORD '$mdp'\""
    umask 077
    cat > "$conf/myhousehold.env" <<EOF
# MyHousehold — créé par installer.sh le $(date +%F). À sauvegarder.
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://myhousehold:$mdp@127.0.0.1:5432/myhousehold
REDIS_URL=redis://127.0.0.1:6379
MH_JWT_SECRET=$(secret)
MH_ENCRYPTION_KEY=$(secret)
MH_PUBLIC_URL=https://$ADRESSE_IP:3443
MH_ALLOW_REGISTRATION=true
MH_DEFAULT_TIMEZONE=$(cat /etc/timezone 2>/dev/null || echo Europe/Paris)
MH_DATA_DIR=$donnees
MH_HTTP_HOST=127.0.0.1
MH_HTTPS_PORT=3443
MH_UPDATE_CHECK=true
MH_EXPOSE_DOCS=false
EOF
    umask 022
    chgrp myhousehold "$conf/myhousehold.env"
    chmod 640 "$conf/myhousehold.env"
  fi

  dire "Services systemd…"
  curl -fsSL -o /etc/systemd/system/myhousehold.service "$TELECHARGER/myhousehold.service"
  curl -fsSL -o /usr/local/bin/myhousehold-maj "$TELECHARGER/myhousehold-maj"
  chmod 755 /usr/local/bin/myhousehold-maj
  curl -fsSL -o /etc/systemd/system/myhousehold-maj.service "$TELECHARGER/myhousehold-maj.service"
  curl -fsSL -o /etc/systemd/system/myhousehold-maj.timer "$TELECHARGER/myhousehold-maj.timer"
  systemctl daemon-reload
  systemctl enable --now redis-server postgresql >/dev/null 2>&1 || true
  systemctl enable myhousehold >/dev/null
  systemctl restart myhousehold
  if [ "$MAJ" = 1 ]; then systemctl enable --now myhousehold-maj.timer >/dev/null; fi
  attendre_sante || echec "Le serveur ne répond pas. Journal : journalctl -u myhousehold -n 50"
  fin "$conf/myhousehold.env"
}

if [ "$MODE" = docker ]; then installer_docker; else installer_classique; fi
