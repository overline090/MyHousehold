#!/usr/bin/env bash
#
# Parcours de bout en bout contre un serveur qui tourne : inscription,
# rotation des jetons, création de foyer, invitation, rôles, isolation
# entre foyers, protection du dernier propriétaire, limitation de débit.
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
OWNER_JSON=$(register owner Marie)
OWNER=$(echo "$OWNER_JSON" | field "['accessToken']")
OWNER_ID=$(echo "$OWNER_JSON" | field "['user']['id']")
OWNER_REFRESH=$(echo "$OWNER_JSON" | field "['refreshToken']")
MEMBER_JSON=$(register member Paul)
MEMBER=$(echo "$MEMBER_JSON" | field "['accessToken']")
MEMBER_ID=$(echo "$MEMBER_JSON" | field "['user']['id']")
OUTSIDER=$(register outsider Lou | field "['accessToken']")
check "trois comptes créés" "ok" "$([[ -n $OWNER && -n $MEMBER && -n $OUTSIDER ]] && echo ok)"

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
echo "Invitation"
CODE=$(curl -s -X POST "$BASE/households/$HID/invites" -H "authorization: Bearer $OWNER" \
  -H 'content-type: application/json' -d '{"role":"CHILD","maxUses":1}' | field "['code']")
LOOSE=$(py "print('${CODE}'.lower()[:4] + '-' + '${CODE}'.lower()[4:])")
check "le code est accepté en minuscules et avec un tiret" "201" \
  "$(status -X POST "$BASE/invites/$LOOSE/accept" -H "authorization: Bearer $MEMBER")"
check "un code à usage unique ne sert pas deux fois" "400" \
  "$(status -X POST "$BASE/invites/$CODE/accept" -H "authorization: Bearer $OUTSIDER")"
check "un code inexistant est refusé" "400" \
  "$(status -X POST "$BASE/invites/AAAA2222/accept" -H "authorization: Bearer $OUTSIDER")"

echo
echo "Rôles"
check "un enfant lit le foyer" "200" "$(status "$BASE/households/$HID" -H "authorization: Bearer $MEMBER")"
check "un enfant ne modifie pas le foyer" "403" \
  "$(status -X PATCH "$BASE/households/$HID" -H "authorization: Bearer $MEMBER" -H 'content-type: application/json' -d '{"name":"Chez moi"}')"
check "un enfant ne crée pas d'invitation" "403" \
  "$(status -X POST "$BASE/households/$HID/invites" -H "authorization: Bearer $MEMBER" -H 'content-type: application/json' -d '{}')"
check "le propriétaire modifie le foyer" "200" \
  "$(status -X PATCH "$BASE/households/$HID" -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"name":"Foyer renommé"}')"

echo
echo "Dernier propriétaire"
check "il ne peut pas se rétrograder" "409" \
  "$(status -X PATCH "$BASE/households/$HID/members/$OWNER_ID" -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"role":"ADULT"}')"
check "il ne peut pas quitter le foyer" "409" \
  "$(status -X DELETE "$BASE/households/$HID/members/$OWNER_ID" -H "authorization: Bearer $OWNER")"

echo
echo "Départ et invalidation du cache d'appartenance"
curl -s -X PATCH "$BASE/households/$HID/members/$MEMBER_ID" -H "authorization: Bearer $OWNER" \
  -H 'content-type: application/json' -d '{"role":"OWNER"}' > /dev/null
check "le rôle transmis, l'ancien propriétaire peut partir" "204" \
  "$(status -X DELETE "$BASE/households/$HID/members/$OWNER_ID" -H "authorization: Bearer $OWNER")"
check "son accès tombe immédiatement" "404" \
  "$(status "$BASE/households/$HID" -H "authorization: Bearer $OWNER")"
check "le nouveau propriétaire garde l'accès" "200" \
  "$(status "$BASE/households/$HID" -H "authorization: Bearer $MEMBER")"

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
