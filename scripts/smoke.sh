#!/usr/bin/env bash
#
# Parcours de bout en bout contre un serveur qui tourne : inscription,
# rotation des jetons, création de foyer, invitation, rôles, isolation
# entre foyers, suppression de compte avec transfert de propriété et
# anonymisation, limitation de débit.
#
# Les vérifications d'administration de l'instance ne tournent que si le
# serveur visé est vierge : le rôle d'administrateur va au premier compte
# créé, que ce script ne peut obtenir que sur une base vide.
#
#   ./scripts/smoke.sh [URL_DE_BASE]
#
# Il écrit dans la base du serveur visé : à n'utiliser que sur une
# instance de développement, jamais sur un foyer réel.
#
# Ce script existe parce que les tests d'intégration automatisés ne sont
# pas encore en place (voir docs/roadmap.md). Il ne les remplace pas.
set -uo pipefail

BASE="${1:-http://localhost:3000}/api/v1"
SUFFIX="$(date +%s)"
FAILURES=0

py() { python3 -c "$1"; }
field() { py "import json,sys; print(json.load(sys.stdin)$1)"; }
status() { curl -s -o /tmp/mh-smoke-body -w '%{http_code}' "$@"; }

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    printf '  ✓ %s\n' "$label"
  else
    printf '  ✗ %s — attendu %s, obtenu %s\n' "$label" "$expected" "$actual"
    cat /tmp/mh-smoke-body 2>/dev/null | head -c 200; echo
    FAILURES=$((FAILURES + 1))
  fi
}

register() {
  curl -s -X POST "$BASE/auth/register" -H 'content-type: application/json' \
    -d "{\"email\":\"$1-$SUFFIX@example.test\",\"password\":\"un mot de passe assez long\",\"displayName\":\"$2\"}"
}

echo "Serveur : $BASE"
echo
echo "Comptes"
# Le premier compte créé sur un serveur vierge devient administrateur de
# l'instance. On le crée d'abord et on ne le supprime jamais, pour que les
# vérifications d'administration restent possibles à la fin.
ADMIN_JSON=$(register admin Admin)
ADMIN=$(echo "$ADMIN_JSON" | field "['accessToken']")
if [[ "$(echo "$ADMIN_JSON" | field "['user']['isServerAdmin']")" == "True" ]]; then
  ADMIN_AVAILABLE=yes
else
  ADMIN_AVAILABLE=no
fi

OWNER_JSON=$(register owner Marie)
OWNER=$(echo "$OWNER_JSON" | field "['accessToken']")
OWNER_ID=$(echo "$OWNER_JSON" | field "['user']['id']")
OWNER_REFRESH=$(echo "$OWNER_JSON" | field "['refreshToken']")
MEMBER_JSON=$(register member Paul)
MEMBER=$(echo "$MEMBER_JSON" | field "['accessToken']")
MEMBER_ID=$(echo "$MEMBER_JSON" | field "['user']['id']")
OUTSIDER_JSON=$(register outsider Lou)
OUTSIDER=$(echo "$OUTSIDER_JSON" | field "['accessToken']")
OUTSIDER_ID=$(echo "$OUTSIDER_JSON" | field "['user']['id']")
check "quatre comptes créés" "ok" \
  "$([[ -n $ADMIN && -n $OWNER && -n $MEMBER && -n $OUTSIDER ]] && echo ok)"
check "un compte ordinaire n'est pas administrateur" "False" \
  "$(echo "$OWNER_JSON" | field "['user']['isServerAdmin']")"

echo
echo "Rotation du jeton de rafraîchissement"
ROTATED=$(curl -s -X POST "$BASE/auth/refresh" -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$OWNER_REFRESH\"}")
NEW_REFRESH=$(echo "$ROTATED" | field "['refreshToken']")
check "un nouveau couple de jetons est émis" "ok" "$([[ -n $NEW_REFRESH ]] && echo ok)"
check "rejouer l'ancien jeton est refusé" "401" \
  "$(status -X POST "$BASE/auth/refresh" -H 'content-type: application/json' -d "{\"refreshToken\":\"$OWNER_REFRESH\"}")"
check "le rejeu révoque aussi le jeton courant" "401" \
  "$(status -X POST "$BASE/auth/refresh" -H 'content-type: application/json' -d "{\"refreshToken\":\"$NEW_REFRESH\"}")"

echo
echo "Foyer"
HID=$(py "import uuid; print(uuid.uuid4())")
create_household() {
  curl -s -X POST "$BASE/households" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d "{\"id\":\"$HID\",\"name\":\"Foyer de test\"}"
}
create_household > /dev/null
create_household > /dev/null
check "création idempotente (même UUID deux fois)" "1" \
  "$(curl -s "$BASE/auth/me" -H "authorization: Bearer $OWNER" | field "['households']" | grep -c 'Foyer de test')"

echo
echo "Isolation entre foyers"
for route in "" "/members" "/invites"; do
  check "un non-membre reçoit 404 sur$([[ -z $route ]] && echo ' /households/:id' || echo " $route")" "404" \
    "$(status "$BASE/households/$HID$route" -H "authorization: Bearer $OUTSIDER")"
done

echo
echo "Invitations"
invite() {
  curl -s -X POST "$BASE/households/$HID/invites" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d "{\"role\":\"$1\",\"maxUses\":1}" | field "['code']"
}
CODE=$(invite ADULT)
LOOSE=$(py "print('${CODE}'.lower()[:4] + '-' + '${CODE}'.lower()[4:])")
check "le code est accepté en minuscules et avec un tiret" "201" \
  "$(status -X POST "$BASE/invites/$LOOSE/accept" -H "authorization: Bearer $MEMBER")"
check "un code à usage unique ne sert pas deux fois" "400" \
  "$(status -X POST "$BASE/invites/$CODE/accept" -H "authorization: Bearer $OUTSIDER")"
check "un code inexistant est refusé" "400" \
  "$(status -X POST "$BASE/invites/AAAA2222/accept" -H "authorization: Bearer $OUTSIDER")"

CHILD_CODE=$(invite CHILD)
curl -s -X POST "$BASE/invites/$CHILD_CODE/accept" -H "authorization: Bearer $OUTSIDER" > /dev/null

echo
echo "Rôles"
check "un enfant lit le foyer" "200" "$(status "$BASE/households/$HID" -H "authorization: Bearer $OUTSIDER")"
check "un enfant ne modifie pas le foyer" "403" \
  "$(status -X PATCH "$BASE/households/$HID" -H "authorization: Bearer $OUTSIDER" -H 'content-type: application/json' -d '{"name":"Chez moi"}')"
check "un enfant ne crée pas d'invitation" "403" \
  "$(status -X POST "$BASE/households/$HID/invites" -H "authorization: Bearer $OUTSIDER" -H 'content-type: application/json' -d '{}')"
check "le propriétaire modifie le foyer" "200" \
  "$(status -X PATCH "$BASE/households/$HID" -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"name":"Foyer renommé"}')"
check "le dernier propriétaire ne peut pas se rétrograder" "409" \
  "$(status -X PATCH "$BASE/households/$HID/members/$OWNER_ID" -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"role":"ADULT"}')"

echo
echo "Pas d'exclusion possible"
check "la route d'exclusion n'existe pas" "404" \
  "$(status -X DELETE "$BASE/households/$HID/members/$MEMBER_ID" -H "authorization: Bearer $OWNER")"

echo
echo "Suppression de compte"
THROWAWAY_JSON=$(register throwaway Jetable)
THROWAWAY=$(echo "$THROWAWAY_JSON" | field "['accessToken']")
check "un mauvais mot de passe ne suffit pas" "401" \
  "$(status -X DELETE "$BASE/users/me" -H "authorization: Bearer $THROWAWAY" -H 'content-type: application/json' -d '{"password":"pas le bon"}')"
check "son titulaire supprime son compte" "204" \
  "$(status -X DELETE "$BASE/users/me" -H "authorization: Bearer $THROWAWAY" -H 'content-type: application/json' -d '{"password":"un mot de passe assez long"}')"
check "son jeton ne vaut plus rien" "401" \
  "$(status "$BASE/auth/me" -H "authorization: Bearer $THROWAWAY")"

echo
echo "Transfert de propriété et invalidation du cache"
check "le propriétaire supprime son compte" "204" \
  "$(status -X DELETE "$BASE/users/me" -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"password":"un mot de passe assez long"}')"
check "son accès au foyer tombe immédiatement" "401" \
  "$(status "$BASE/households/$HID" -H "authorization: Bearer $OWNER")"
check "l'adulte restant devient propriétaire" "OWNER" \
  "$(curl -s "$BASE/households/$HID" -H "authorization: Bearer $MEMBER" > /dev/null; curl -s "$BASE/households/$HID/members" -H "authorization: Bearer $MEMBER" | py "
import json,sys
for m in json.load(sys.stdin):
    if m['userId'] == '$MEMBER_ID': print(m['role'])")"
check "l'ancien propriétaire n'apparaît plus dans le foyer" "0" \
  "$(curl -s "$BASE/households/$HID/members" -H "authorization: Bearer $MEMBER" | py "
import json,sys
print(sum(1 for m in json.load(sys.stdin) if m['userId'] == '$OWNER_ID'))")"

echo
echo "Administration de l'instance"
if [[ "$ADMIN_AVAILABLE" == "yes" ]]; then
  check "un non-administrateur ne voit pas la zone d'admin" "404" \
    "$(status "$BASE/admin/users" -H "authorization: Bearer $MEMBER")"
  check "l'administrateur liste les comptes" "200" \
    "$(status "$BASE/admin/users" -H "authorization: Bearer $ADMIN")"
  check "l'historique d'un compte supprimé est anonymisé" "Ancien membre" \
    "$(curl -s "$BASE/admin/users?includeDeleted=true" -H "authorization: Bearer $ADMIN" | py "
import json,sys
for u in json.load(sys.stdin):
    if u['id'] == '$OWNER_ID': print(u['displayName'])")"
  check "son adresse e-mail est rendue inutilisable" "yes" \
    "$(curl -s "$BASE/admin/users?includeDeleted=true" -H "authorization: Bearer $ADMIN" | py "
import json,sys
for u in json.load(sys.stdin):
    if u['id'] == '$OWNER_ID': print('yes' if u['email'].endswith('@invalide.local') else u['email'])")"
  check "l'administrateur supprime le compte d'un autre" "204" \
    "$(status -X DELETE "$BASE/admin/users/$MEMBER_ID" -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' -d '{"password":"un mot de passe assez long"}')"
else
  echo "  — ignoré : le serveur visé n'est pas vierge, aucun compte de ce"
  echo "    script n'est administrateur de l'instance."
fi

echo
echo "Limitation de débit sur la connexion"
LAST=""
for _ in 1 2 3 4 5 6; do
  LAST=$(status -X POST "$BASE/auth/login" -H 'content-type: application/json' \
    -d '{"email":"inconnu@example.test","password":"mauvais mot de passe"}')
done
check "la force brute est bloquée après quelques essais" "429" "$LAST"

echo
if (( FAILURES == 0 )); then
  echo "Tout est passé."
else
  echo "$FAILURES vérification(s) en échec."
fi
exit $(( FAILURES > 0 ))
