#!/usr/bin/env bash
#
# Parcours de l'assistant d'installation, de bout en bout.
#
#   ./scripts/smoke-setup.sh [URL_DE_BASE]
#
# Exige un serveur **vierge** : l'installation ne se fait qu'une fois, et
# ce script la termine. À n'utiliser que sur une instance de
# développement, jamais sur un foyer réel.
set -uo pipefail

BASE="${1:-http://localhost:3000}"
API="$BASE/api/v1"
FAILURES=0

py() { python3 -c "$1"; }
field() { py "import json,sys; print(json.load(sys.stdin)$1)"; }
status() { curl -s -o /tmp/mh-setup-body -w '%{http_code}' "$@"; }
code_erreur() { py "import json; print(json.load(open('/tmp/mh-setup-body'))['error']['code'])"; }

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    printf '  ✓ %s\n' "$label"
  else
    printf '  ✗ %s — attendu %s, obtenu %s\n' "$label" "$expected" "$actual"
    head -c 200 /tmp/mh-setup-body 2>/dev/null; echo
    FAILURES=$((FAILURES + 1))
  fi
}

echo "Serveur : $BASE"
echo
echo "État initial"
ETAT=$(curl -s "$BASE/setup/state")
if [[ "$(echo "$ETAT" | field "['completed']")" != "False" ]]; then
  echo "  Ce serveur est déjà installé : ce script demande une instance vierge."
  exit 1
fi
check "l'assistant attend à la première étape applicable" "import" \
  "$(echo "$ETAT" | field "['currentStep']")"
check "l'étape réseau est déclarée non applicable hors image Raspberry Pi" "False" \
  "$(echo "$ETAT" | py "
import json,sys
print(next(s['applicable'] for s in json.load(sys.stdin)['steps'] if s['id'] == 'network'))" <<< "$ETAT")"
check "le fuseau est détecté, pas demandé" "yes" \
  "$(echo "$ETAT" | py "
import json,sys; print('yes' if json.load(sys.stdin)['detectedTimezone'] else 'no')")"
status -X POST "$BASE/setup/network" -H 'content-type: application/json' -d '{}' > /dev/null
check "configurer le réseau y est refusé, et dit pourquoi" "SETUP_NOT_APPLICABLE" "$(code_erreur)"

echo
echo "Étape 2 — reprendre la configuration de l'app"
CODE_IMPORT=$(curl -s -X POST "$BASE/setup/pairing" -H 'content-type: application/json' \
  -d '{"purpose":"IMPORT"}' | field "['code']")
check "un code d'appariement est émis" "PENDING" \
  "$(curl -s "$BASE/setup/pairing/$CODE_IMPORT" | field "['status']")"
status -X POST "$BASE/setup/import" -H 'content-type: application/json' \
  -d '{"code":"XXXX-YYYY","householdName":"Maison"}' > /dev/null
check "un code inconnu est refusé" "PAIRING_INVALID" "$(code_erreur)"

RECAP=$(curl -s -X POST "$BASE/setup/import" -H 'content-type: application/json' -d "{
  \"code\": \"$CODE_IMPORT\",
  \"householdName\": \"Maison des Dupont\",
  \"timezone\": \"Europe/Paris\",
  \"tasks\": [
    {\"title\": \"Sortir les poubelles\", \"rrule\": \"FREQ=WEEKLY;BYDAY=MO\", \"dueTime\": \"19:00\", \"priority\": 1},
    {\"title\": \"Vider le lave-vaisselle\", \"rrule\": \"FREQ=DAILY\"}
  ],
  \"backgroundTasks\": [{\"title\": \"Changer les draps\", \"maxIntervalSeconds\": 1209600}]
}")
check "l'import récapitule ce qui a été repris" "2 1" \
  "$(echo "$RECAP" | py "
import json,sys
d = json.load(sys.stdin)['imported']; print(d['tasks'], d['backgroundTasks'])")"
check "il dit aussi ce qui manque" "yes" \
  "$(echo "$RECAP" | py "
import json,sys
ids = {m['id'] for m in json.load(sys.stdin)['missing']}
print('yes' if 'account' in ids else sorted(ids))")"
status -X POST "$BASE/setup/import" -H 'content-type: application/json' \
  -d "{\"code\":\"$CODE_IMPORT\",\"householdName\":\"Encore\"}" > /dev/null
check "le code ne sert pas deux fois" "PAIRING_INVALID" "$(code_erreur)"

echo
echo "Étape 3 — le foyer"
ETAT=$(curl -s -X POST "$BASE/setup/household" -H 'content-type: application/json' \
  -d '{"name":"Maison des Dupont"}')
check "le foyer est créé" "Maison des Dupont" "$(echo "$ETAT" | field "['household']['name']")"
check "il reprend le fuseau du téléphone" "Europe/Paris" \
  "$(echo "$ETAT" | field "['household']['timezone']")"
check "l'assistant passe à l'étape du compte" "account" \
  "$(echo "$ETAT" | field "['currentStep']")"

echo
echo "Étape 4 — premier compte, depuis le téléphone"
status -X POST "$BASE/setup/claim" -H 'content-type: application/json' \
  -d '{"code":"ZZZZ-ZZZZ","email":"marie@example.test","password":"un mot de passe assez long","firstName":"Marie","lastName":"Dupont"}' > /dev/null
check "sans code d'appariement valable, pas de compte" "PAIRING_INVALID" "$(code_erreur)"

CODE_CLAIM=$(curl -s -X POST "$BASE/setup/pairing" -H 'content-type: application/json' \
  -d '{"purpose":"CLAIM"}' | field "['code']")
SESSION=$(curl -s -X POST "$BASE/setup/claim" -H 'content-type: application/json' -d "{
  \"code\": \"$CODE_CLAIM\",
  \"email\": \"marie@example.test\",
  \"password\": \"un mot de passe assez long\",
  \"firstName\": \"Marie\",
  \"lastName\": \"Dupont\"
}")
TOKEN=$(echo "$SESSION" | field "['accessToken']")
check "le compte est créé et la session ouverte" "ok" "$([[ -n $TOKEN ]] && echo ok)"
check "il administre le foyer" "yes" \
  "$(echo "$SESSION" | py "
import json,sys
droits = set(json.load(sys.stdin)['user']['rights'])
print('yes' if {'MANAGE_SERVER','MANAGE_STATUSES'} <= droits else sorted(droits))")"
check "la session nomme le foyer servi par cette machine" "ok" \
  "$(echo "$SESSION" | py "
import json,sys; print('ok' if json.load(sys.stdin)['household']['id'] else 'aucun')")"

# Tout est une tâche : la liste contient aussi le compteur importé,
# devenu tâche de fond. On compte donc les récurrentes.
check "les tâches récurrentes du téléphone sont là" "2" \
  "$(curl -s "$API/tasks?kind=SCHEDULED" -H "authorization: Bearer $TOKEN" | py "
import json,sys; print(len(json.load(sys.stdin)))")"
check "leurs échéances sont déjà matérialisées" "yes" \
  "$(curl -s "$API/occurrences?from=$(py "import datetime; print(datetime.date.today().isoformat())")&to=$(py "import datetime; print((datetime.date.today()+datetime.timedelta(days=14)).isoformat())")" \
    -H "authorization: Bearer $TOKEN" | py "
import json,sys; print('yes' if json.load(sys.stdin)['data'] else 'aucune')")"
check "le compteur du téléphone est devenu une tâche de fond" "1" \
  "$(curl -s "$API/tasks?kind=BACKGROUND" -H "authorization: Bearer $TOKEN" | py "
import json,sys; print(len(json.load(sys.stdin)))")"

echo
echo "Étape 5 — terminé"
check "l'installation se verrouille" "True" \
  "$(curl -s -X POST "$BASE/setup/complete" -H 'content-type: application/json' | field "['completed']")"
status "$BASE/setup/state" > /dev/null
check "l'assistant ne répond plus" "SETUP_ALREADY_DONE" "$(code_erreur)"
status -X POST "$API/auth/register" -H 'content-type: application/json' \
  -d '{"email":"inconnu@example.test","password":"un mot de passe assez long","firstName":"X","lastName":"Y"}' > /dev/null
check "les inscriptions libres sont fermées" "REGISTRATION_CLOSED" "$(code_erreur)"
check "le foyer reste utilisable" "200" \
  "$(status "$API/household" -H "authorization: Bearer $TOKEN")"

echo
if (( FAILURES == 0 )); then
  echo "Tout est passé."
else
  echo "$FAILURES vérification(s) en échec."
fi
exit $(( FAILURES > 0 ))
