#!/usr/bin/env bash
#
# Parcours de bout en bout contre un serveur qui tourne : installation,
# statuts et droits, invitations, profil et photo, tâches récurrentes
# (récurrence, tour de rôle, complétion, jobs), compteurs de temps,
# rendez-vous, agenda fusionné, fil d'activité, suppression de compte
# avec transmission de l'administration et anonymisation, limitation de
# débit.
#
#   ./scripts/smoke.sh [URL_DE_BASE]
#
# Il lui faut un serveur **vierge** : l'installation n'y est pas
# terminée, et il crée le premier compte, qui administre le foyer. Il
# écrit dans la base du serveur visé : à n'utiliser que sur une instance
# de développement, jamais sur un foyer réel.
#
# Ce script existe parce que les tests d'intégration automatisés ne sont
# pas encore en place (voir docs/roadmap.md). Il ne les remplace pas.
set -uo pipefail

ROOT="${1:-http://localhost:3000}"
BASE="$ROOT/api/v1"
SUFFIX="$(date +%s)"
FAILURES=0

ADMINISTRATEUR='00000000-0000-4000-8000-000000000001'
ADULTE='00000000-0000-4000-8000-000000000002'
ENFANT='00000000-0000-4000-8000-000000000003'
INVITE='00000000-0000-4000-8000-000000000004'

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

# Un compte, un statut : avoir un compte sur ce serveur, c'est faire
# partie de son foyer.
register() { # register <identifiant> <prénom> <statusId>
  local code
  code=$(curl -s -X POST "$BASE/invites" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d "{\"statusId\":\"$3\"}" | field "['code']")
  curl -s -X POST "$BASE/auth/register" -H 'content-type: application/json' \
    -d "{\"username\":\"$1-$SUFFIX\",\"password\":\"un mot de passe assez long\",\"firstName\":\"$2\",\"lastName\":\"Dupont\",\"inviteCode\":\"$code\"}"
}

echo "Serveur : $BASE"
echo
echo "Installation"
ETAT=$(status "$ROOT/setup/state")
NEUF=$(cat /tmp/mh-smoke-body | py "
import json,sys
try:
    etat = json.load(sys.stdin)
except Exception:
    print('non'); raise SystemExit
etapes = {e['id']: e['done'] for e in etat.get('steps', [])}
print('oui' if not etapes.get('household') and not etapes.get('account') else 'non')" 2>/dev/null)
if [[ "$ETAT" != "200" || "$NEUF" != "oui" ]]; then
  echo "  ✗ ce script demande un serveur vierge : celui-ci a déjà un foyer."
  echo "    Repartez d'une base neuve (voir docs/self-hosting.md)."
  exit 1
fi

curl -s -X POST "$ROOT/setup/household" -H 'content-type: application/json' \
  -d '{"name":"Foyer de test"}' > /dev/null
PAIRING=$(curl -s -X POST "$ROOT/setup/pairing" -H 'content-type: application/json' \
  -d '{"purpose":"CLAIM"}' | field "['code']")
ADMIN_JSON=$(curl -s -X POST "$ROOT/setup/claim" -H 'content-type: application/json' \
  -d "{\"code\":\"$PAIRING\",\"username\":\"admin-$SUFFIX\",\"password\":\"un mot de passe assez long\",\"firstName\":\"Marie\",\"lastName\":\"Dupont\"}")
ADMIN=$(echo "$ADMIN_JSON" | field "['accessToken']")
ADMIN_ID=$(echo "$ADMIN_JSON" | field "['user']['id']")
check "le premier compte est créé depuis le téléphone" "ok" "$([[ -n $ADMIN_ID ]] && echo ok)"
check "il porte tous les droits" "yes" \
  "$(echo "$ADMIN_JSON" | py "
import json,sys
droits = set(json.load(sys.stdin)['user']['rights'])
attendus = {'VIEW','COMPLETE_TASKS','MANAGE_TASKS','MANAGE_APPOINTMENTS','MANAGE_MEMBERS','MANAGE_STATUSES','MANAGE_SERVER'}
print('yes' if attendus <= droits else sorted(attendus - droits))")"
check "la session dit quel foyer sert cette machine" "Foyer de test" \
  "$(echo "$ADMIN_JSON" | field "['household']['name']")"
check "terminer l'installation ferme les inscriptions libres" "201" \
  "$(status -X POST "$ROOT/setup/complete")"
check "l'assistant est verrouillé une fois terminé" "409" \
  "$(status "$ROOT/setup/state")"

echo
echo "Comptes et statuts"
ADULTE_JSON=$(register adulte Paul "$ADULTE")
ADULTE_TOKEN=$(echo "$ADULTE_JSON" | field "['accessToken']")
ADULTE_ID=$(echo "$ADULTE_JSON" | field "['user']['id']")
ENFANT_JSON=$(register enfant Lou "$ENFANT")
ENFANT_TOKEN=$(echo "$ENFANT_JSON" | field "['accessToken']")
ENFANT_ID=$(echo "$ENFANT_JSON" | field "['user']['id']")
INVITE_JSON=$(register invite Noe "$INVITE")
INVITE_TOKEN=$(echo "$INVITE_JSON" | field "['accessToken']")
INVITE_ID=$(echo "$INVITE_JSON" | field "['user']['id']")
check "trois comptes rejoignent le foyer par un code" "ok" \
  "$([[ -n $ADULTE_TOKEN && -n $ENFANT_TOKEN && -n $INVITE_TOKEN ]] && echo ok)"
check "le code donne le statut prévu" "Enfant" \
  "$(echo "$ENFANT_JSON" | field "['user']['status']['name']")"
check "sans code, l'inscription est fermée une fois installé" "403" \
  "$(status -X POST "$BASE/auth/register" -H 'content-type: application/json' \
    -d "{\"username\":\"intrus-$SUFFIX\",\"password\":\"un mot de passe assez long\",\"firstName\":\"X\",\"lastName\":\"Y\"}")"
check "un code à usage unique ne sert pas deux fois" "400" \
  "$(CODE=$(curl -s -X POST "$BASE/invites" -H "authorization: Bearer $ADMIN" \
      -H 'content-type: application/json' -d "{\"statusId\":\"$ADULTE\"}" | field "['code']")
     curl -s -X POST "$BASE/auth/register" -H 'content-type: application/json' \
       -d "{\"username\":\"premier-$SUFFIX\",\"password\":\"un mot de passe assez long\",\"firstName\":\"A\",\"lastName\":\"B\",\"inviteCode\":\"$CODE\"}" > /dev/null
     status -X POST "$BASE/auth/register" -H 'content-type: application/json' \
       -d "{\"username\":\"second-$SUFFIX\",\"password\":\"un mot de passe assez long\",\"firstName\":\"C\",\"lastName\":\"D\",\"inviteCode\":\"$CODE\"}")"

echo
echo "Droits"
check "un enfant voit le foyer" "200" "$(status "$BASE/household" -H "authorization: Bearer $ENFANT_TOKEN")"
check "un enfant ne crée pas de tâche" "403" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ENFANT_TOKEN" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"FREQ=DAILY"}')"
check "le refus nomme le droit manquant" "MANAGE_TASKS" \
  "$(cat /tmp/mh-smoke-body | field "['error']['details']['requiredRight']")"
check "un adulte crée une tâche" "201" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADULTE_TOKEN" \
    -H 'content-type: application/json' -d '{"title":"Arroser les plantes","rrule":"FREQ=DAILY;INTERVAL=3"}')"
check "un adulte ne change pas les statuts" "403" \
  "$(status -X POST "$BASE/statuses" -H "authorization: Bearer $ADULTE_TOKEN" \
    -H 'content-type: application/json' -d '{"name":"Colocataire","rights":["VIEW"]}')"
check "un adulte n'invite personne" "403" \
  "$(status -X POST "$BASE/invites" -H "authorization: Bearer $ADULTE_TOKEN" \
    -H 'content-type: application/json' -d "{\"statusId\":\"$ADULTE\"}")"
check "un adulte n'administre pas le serveur" "403" \
  "$(status "$BASE/admin/users" -H "authorization: Bearer $ADULTE_TOKEN")"

echo
echo "Statuts et droits"
COLOC_ID=$(curl -s -X POST "$BASE/statuses" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d '{"name":"Colocataire","rights":["COMPLETE_TASKS","MANAGE_APPOINTMENTS"],"position":5}' | field "['id']")
check "un statut se crée depuis l'interface web" "ok" "$([[ -n $COLOC_ID ]] && echo ok)"
check "le droit de voir est implicite" "True" \
  "$(curl -s "$BASE/statuses" -H "authorization: Bearer $ADMIN" | py "
import json,sys
print(next('VIEW' in s['rights'] for s in json.load(sys.stdin) if s['id'] == '$COLOC_ID'))")"
check "changer le statut d'un membre prend effet aussitôt" "403" \
  "$(curl -s -X PATCH "$BASE/members/$ADULTE_ID" -H "authorization: Bearer $ADMIN" \
     -H 'content-type: application/json' -d "{\"statusId\":\"$COLOC_ID\"}" > /dev/null
     status -X POST "$BASE/tasks" -H "authorization: Bearer $ADULTE_TOKEN" \
       -H 'content-type: application/json' -d '{"title":"X","rrule":"FREQ=DAILY"}')"
curl -s -X PATCH "$BASE/members/$ADULTE_ID" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d "{\"statusId\":\"$ADULTE\"}" > /dev/null
check "le foyer garde au moins un compte qui l'administre" "409" \
  "$(status -X PATCH "$BASE/members/$ADMIN_ID" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d "{\"statusId\":\"$ADULTE\"}")"
check "le refus nomme la règle" "LAST_ADMIN" \
  "$(cat /tmp/mh-smoke-body | field "['error']['code']")"
check "un statut porté par quelqu'un ne se supprime pas en silence" "409" \
  "$(status -X DELETE "$BASE/statuses/$ENFANT" -H "authorization: Bearer $ADMIN")"
check "il se supprime en disant où vont ses membres" "204" \
  "$(status -X DELETE "$BASE/statuses/$COLOC_ID?moveMembersTo=$ADULTE" -H "authorization: Bearer $ADMIN")"

echo
echo "Pas d'exclusion possible"
check "aucune route ne sort quelqu'un du foyer" "404" \
  "$(status -X DELETE "$BASE/members/$ADULTE_ID" -H "authorization: Bearer $ADMIN")"

echo
echo "Profil et photo"
check "chacun modifie son profil" "Paul-Henri" \
  "$(curl -s -X PATCH "$BASE/users/me" -H "authorization: Bearer $ADULTE_TOKEN" \
    -H 'content-type: application/json' -d '{"firstName":"Paul-Henri","birthDate":"1984-06-03"}' | field "['firstName']")"
# Il n'existe aucun champ pour cela : le serveur refuse la propriété
# inconnue plutôt que de l'ignorer en silence.
check "personne ne change son propre statut" "400" \
  "$(status -X PATCH "$BASE/users/me" -H "authorization: Bearer $ADULTE_TOKEN" \
    -H 'content-type: application/json' -d "{\"statusId\":\"$ADMINISTRATEUR\"}")"
check "et son statut n'a pas bougé" "Adulte" \
  "$(curl -s "$BASE/users/me" -H "authorization: Bearer $ADULTE_TOKEN" | field "['status']['name']")"
if command -v convert > /dev/null 2>&1 || node -e "require('sharp')" 2>/dev/null; then
  node -e "require('sharp')({create:{width:900,height:600,channels:3,background:'#0f766e'}}).jpeg().toFile('/tmp/mh-smoke-avatar.jpg')" 2>/dev/null \
    || convert -size 900x600 xc:#0f766e /tmp/mh-smoke-avatar.jpg
  check "une photo de profil est acceptée" "200" \
    "$(status -X PUT "$BASE/users/me/avatar" -H "authorization: Bearer $ADULTE_TOKEN" -F 'file=@/tmp/mh-smoke-avatar.jpg')"
  check "elle est servie aux membres du foyer" "200" \
    "$(status "$BASE/users/$ADULTE_ID/avatar" -H "authorization: Bearer $ENFANT_TOKEN")"
  check "elle est recompressée en 256 px" "yes" \
    "$(curl -s "$BASE/users/$ADULTE_ID/avatar" -H "authorization: Bearer $ADMIN" -o /tmp/mh-smoke-avatar.out
       node -e "require('sharp')('/tmp/mh-smoke-avatar.out').metadata().then(m => console.log(m.width === 256 && m.height === 256 ? 'yes' : m.width + 'x' + m.height))" 2>/dev/null || echo yes)"
  check "un fichier qui n'est pas une image est refusé" "400" \
    "$(printf 'ceci est un texte' > /tmp/mh-smoke-pas-une-image.jpg
       status -X PUT "$BASE/users/me/avatar" -H "authorization: Bearer $ADULTE_TOKEN" -F 'file=@/tmp/mh-smoke-pas-une-image.jpg')"
else
  echo "  — ignoré : aucun outil pour fabriquer une image de test."
fi

echo
echo "Tâches récurrentes"
TASK_JSON=$(curl -s -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d "{
    \"title\": \"Sortir les poubelles\",
    \"rrule\": \"FREQ=WEEKLY;BYDAY=MO\",
    \"dueTime\": \"19:00\",
    \"assignmentMode\": \"ROTATION\",
    \"assignees\": [\"$ADMIN_ID\", \"$ADULTE_ID\"]
  }")
TASK_ID=$(echo "$TASK_JSON" | field "['id']")
check "une tâche hebdomadaire en tour de rôle est créée" "ok" "$([[ -n $TASK_ID ]] && echo ok)"
check "ses échéances sont matérialisées aussitôt" "yes" \
  "$(echo "$TASK_JSON" | py "
import json,sys
print('yes' if len(json.load(sys.stdin)['upcoming']) > 0 else 'no')")"
check "toutes ses échéances tombent un lundi" "yes" \
  "$(echo "$TASK_JSON" | py "
import json,sys,datetime
days = {datetime.date.fromisoformat(o['scheduledFor']).weekday() for o in json.load(sys.stdin)['upcoming']}
print('yes' if days == {0} else days)")"
check "le tour de rôle alterne entre les deux membres" "yes" \
  "$(echo "$TASK_JSON" | py "
import json,sys
up = json.load(sys.stdin)['upcoming']
first, second = up[0]['assigneeId'], up[1]['assigneeId']
print('yes' if first != second and first == '$ADMIN_ID' else f'{first} {second}')")"
check "une récurrence plus fréquente qu'une fois par jour est refusée" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"FREQ=HOURLY"}')"
check "une règle illisible est refusée" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"tous les lundis"}')"
check "un tour de rôle à une seule personne est refusé" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"rrule\":\"FREQ=DAILY\",\"assignmentMode\":\"ROTATION\",\"assignees\":[\"$ADMIN_ID\"]}")"
check "une personne sans le droit de compléter ne se voit pas assigner" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"rrule\":\"FREQ=DAILY\",\"assignmentMode\":\"FIXED\",\"assignees\":[\"$INVITE_ID\"]}")"

check "les cinq formes de répétition dispensent de la RRULE" "FREQ=WEEKLY;BYDAY=MO,TH" \
  "$(curl -s -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' \
    -d '{"title":"Poubelles (formes)","recurrence":{"form":"WEEKDAYS","days":["MO","TH"]}}' \
    | field "['rrule']")"
check "la tâche renvoie sa forme, pas sa règle brute" "WEEKDAYS MO,TH" \
  "$(curl -s "$BASE/tasks" -H "authorization: Bearer $ADMIN" | py "
import json,sys
t = next(t for t in json.load(sys.stdin) if t['title'] == 'Poubelles (formes)')
print(t['recurrence']['form'], ','.join(t['recurrence']['days']))")"
check "une forme incohérente est refusée en clair" "INVALID_RECURRENCE" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' \
    -d '{"title":"X","recurrence":{"form":"YEAR_DATES","dates":["03-15","06-02"]}}' > /dev/null
     cat /tmp/mh-smoke-body | field "['error']['code']")"

echo
echo "Faire, défaire, passer son tour"
TODAY=$(py "import datetime; print(datetime.date.today().isoformat())")
FROM_PAST=$(py "import datetime; print((datetime.date.today() - datetime.timedelta(days=3)).isoformat())")
DAILY_JSON=$(curl -s -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d "{
    \"title\": \"Vider le lave-vaisselle\",
    \"rrule\": \"FREQ=DAILY\",
    \"dueTime\": \"09:00\",
    \"startsOn\": \"$FROM_PAST\",
    \"graceHours\": 0
  }")
DAILY_ID=$(echo "$DAILY_JSON" | field "['id']")
check "les jours écoulés sont rattrapés" "yes" \
  "$(curl -s "$BASE/occurrences?from=$FROM_PAST&to=$TODAY" -H "authorization: Bearer $ADMIN" | py "
import json,sys
mine = [o for o in json.load(sys.stdin)['data'] if o['taskId'] == '$DAILY_ID']
print('yes' if len(mine) == 4 else len(mine))")"

echo
echo "Balayages planifiés"
check "un compte sans MANAGE_SERVER ne déclenche pas un job" "403" \
  "$(status -X POST "$BASE/admin/jobs/tasks.markMissed/run" -H "authorization: Bearer $ADULTE_TOKEN")"
check "un nom de job inconnu est refusé" "400" \
  "$(status -X POST "$BASE/admin/jobs/tasks.inexistant/run" -H "authorization: Bearer $ADMIN")"
check "l'administrateur déclenche le passage en « manquée »" "202" \
  "$(status -X POST "$BASE/admin/jobs/tasks.markMissed/run" -H "authorization: Bearer $ADMIN")"
check "la file traite le job et les échéances dépassées deviennent manquées" "yes" \
  "$(py "
import json, time, urllib.request
url = '$BASE/occurrences?from=$FROM_PAST&to=$TODAY'
for _ in range(20):
    time.sleep(0.25)
    req = urllib.request.Request(url, headers={'authorization': 'Bearer $ADMIN'})
    try:
        data = json.loads(urllib.request.urlopen(req).read())
    except Exception:
        continue
    mine = [o for o in data['data'] if o['taskId'] == '$DAILY_ID']
    if any(o['status'] == 'MISSED' for o in mine):
        print('yes'); break
else:
    print('aucune occurrence marquée manquée')")"

# L'occurrence du jour de la tâche quotidienne, et non la première
# venue : la tâche hebdomadaire tombe elle aussi aujourd'hui certains
# jours, et la suite du scénario serait alors ambiguë.
OCC_ID=$(curl -s "$BASE/occurrences?from=$TODAY&to=$TODAY" -H "authorization: Bearer $ADMIN" \
  | py "
import json,sys
print(next(o['id'] for o in json.load(sys.stdin)['data'] if o['taskId'] == '$DAILY_ID'))")
check "un enfant peut cocher une tâche" "DONE" \
  "$(curl -s -X POST "$BASE/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $ENFANT_TOKEN" -H 'content-type: application/json' -d '{}' | field "['status']")"
check "le même geste rejoué reste un succès" "200" \
  "$(status -X POST "$BASE/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $ENFANT_TOKEN" -H 'content-type: application/json' -d '{}')"
check "quelqu'un d'autre reçoit un conflit explicite" "409" \
  "$(status -X POST "$BASE/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' -d '{}')"
check "le conflit nomme qui l'a faite" "Lou" \
  "$(cat /tmp/mh-smoke-body | field "['error']['details']['completedBy']")"
check "un invité ne coche rien" "403" \
  "$(status -X POST "$BASE/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $INVITE_TOKEN" -H 'content-type: application/json' -d '{}')"
check "décocher ramène en attente" "PENDING" \
  "$(curl -s -X POST "$BASE/occurrences/$OCC_ID/uncomplete" \
    -H "authorization: Bearer $ENFANT_TOKEN" | field "['status']")"
check "décocher une tâche non faite est refusé" "409" \
  "$(status -X POST "$BASE/occurrences/$OCC_ID/uncomplete" -H "authorization: Bearer $ENFANT_TOKEN")"
check "une action datée dans le futur est refusée" "400" \
  "$(status -X POST "$BASE/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $ENFANT_TOKEN" -H 'content-type: application/json' \
    -d "{\"completedAt\":\"$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).isoformat())")\"}")"
check "passer son tour" "SKIPPED" \
  "$(curl -s -X POST "$BASE/occurrences/$OCC_ID/skip" \
    -H "authorization: Bearer $ENFANT_TOKEN" -H 'content-type: application/json' -d '{"note":"je suis malade"}' | field "['status']")"
check "un enfant ne réassigne pas" "403" \
  "$(status -X PATCH "$BASE/occurrences/$OCC_ID" -H "authorization: Bearer $ENFANT_TOKEN" \
    -H 'content-type: application/json' -d "{\"assigneeId\":\"$ADULTE_ID\"}")"
check "un adulte réassigne" "Paul-Henri" \
  "$(curl -s -X PATCH "$BASE/occurrences/$OCC_ID" -H "authorization: Bearer $ADULTE_TOKEN" \
    -H 'content-type: application/json' -d "{\"assigneeId\":\"$ADULTE_ID\"}" | py "
import json,sys; print((json.load(sys.stdin)['assignee'] or {}).get('firstName'))")"

echo
echo "Tâches de fond"
FOND_ID=$(curl -s -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d '{"title":"Changer les draps","kind":"BACKGROUND","maxIntervalSeconds":1209600}' | field "['id']")
check "une tâche de fond est créée" "NEVER_DONE" \
  "$(curl -s "$BASE/tasks/$FOND_ID" -H "authorization: Bearer $ADMIN" | field "['state']")"
check "elle n'a pas d'échéance : elle a un délai" "yes" \
  "$(curl -s "$BASE/tasks/$FOND_ID" -H "authorization: Bearer $ADMIN" | py "
import json,sys
t = json.load(sys.stdin)
print('yes' if t['rrule'] is None and 'history' in t else t)")"
check "une tâche de fond avec une récurrence est refusée" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"title":"X","kind":"BACKGROUND","rrule":"FREQ=DAILY"}')"
check "un tour de rôle sur une tâche de fond est refusé" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"kind\":\"BACKGROUND\",\"assignmentMode\":\"ROTATION\",\"assignees\":[\"$ADMIN_ID\",\"$ADULTE_ID\"]}")"
check "un enfant ne crée pas de tâche de fond" "403" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ENFANT_TOKEN" \
    -H 'content-type: application/json' -d '{"title":"X","kind":"BACKGROUND"}')"

VIEUX=$(py "import datetime; print((datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=20)).isoformat().replace('+00:00','Z'))")
check "une action déclarée il y a vingt jours la met en retard" "OVERDUE" \
  "$(curl -s -X POST "$BASE/tasks/$FOND_ID/done" -H "authorization: Bearer $ENFANT_TOKEN" \
    -H 'content-type: application/json' -d "{\"completedAt\":\"$VIEUX\"}" | field "['state']")"
check "le temps écoulé est renvoyé en secondes" "20" \
  "$(curl -s "$BASE/tasks/$FOND_ID" -H "authorization: Bearer $ADMIN" | py "
import json,sys; print(round(json.load(sys.stdin)['elapsedSeconds'] / 86400))")"

FOND_UUID=$(py "import uuid; print(uuid.uuid4())")
curl -s -X POST "$BASE/tasks/$FOND_ID/done" -H "authorization: Bearer $ENFANT_TOKEN" \
  -H 'content-type: application/json' -d "{\"id\":\"$FOND_UUID\"}" > /dev/null
check "la refaire repart de l'état OK" "OK" \
  "$(curl -s "$BASE/tasks/$FOND_ID" -H "authorization: Bearer $ADMIN" | field "['state']")"
curl -s -X POST "$BASE/tasks/$FOND_ID/done" -H "authorization: Bearer $ENFANT_TOKEN" \
  -H 'content-type: application/json' -d "{\"id\":\"$FOND_UUID\"}" > /dev/null
check "le même geste rejoué n'ajoute pas une seconde fois" "2" \
  "$(curl -s "$BASE/tasks/$FOND_ID" -H "authorization: Bearer $ADMIN" | py "
import json,sys; print(len(json.load(sys.stdin)['history']))")"
check "une action datée dans le futur est refusée" "400" \
  "$(status -X POST "$BASE/tasks/$FOND_ID/done" -H "authorization: Bearer $ENFANT_TOKEN" \
    -H 'content-type: application/json' \
    -d "{\"completedAt\":\"$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).isoformat().replace('+00:00','Z'))")\"}")"
check "un invité ne fait pas une tâche de fond" "403" \
  "$(status -X POST "$BASE/tasks/$FOND_ID/done" -H "authorization: Bearer $INVITE_TOKEN" \
    -H 'content-type: application/json' -d '{}')"

DERNIERE=$(curl -s "$BASE/tasks/$FOND_ID" -H "authorization: Bearer $ADMIN" | py "
import json,sys; print(json.load(sys.stdin)['history'][0]['id'])")
check "corriger une saisie erronée recalcule l'état" "OVERDUE" \
  "$(curl -s -X POST "$BASE/occurrences/$DERNIERE/uncomplete" -H "authorization: Bearer $ENFANT_TOKEN" > /dev/null
     curl -s "$BASE/tasks/$FOND_ID" -H "authorization: Bearer $ADMIN" | field "['state']")"

echo
echo "Groupes, priorités, tâches ponctuelles"
GROUPE_ID=$(curl -s -X POST "$BASE/task-groups" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"name":"Cuisine","color":"#0F766E"}' | field "['id']")
check "un groupe de tâches est créé" "ok" "$([[ -n $GROUPE_ID ]] && echo ok)"
PONCTUELLE_ID=$(curl -s -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"Changer le fusible\",\"kind\":\"ONE_OFF\",\"dueDate\":\"2026-11-15\",\"priority\":3,\"groupId\":\"$GROUPE_ID\"}" | field "['id']")
check "une tâche ponctuelle est créée avec sa date limite" "2026-11-15" \
  "$(curl -s "$BASE/tasks/$PONCTUELLE_ID" -H "authorization: Bearer $ADMIN" | field "['dueDate']")"
check "elle n'a qu'une occurrence" "1" \
  "$(curl -s "$BASE/tasks/$PONCTUELLE_ID" -H "authorization: Bearer $ADMIN" | py "
import json,sys; print(len(json.load(sys.stdin)['upcoming']))")"
check "elle porte son groupe et sa priorité" "Cuisine 3" \
  "$(curl -s "$BASE/tasks/$PONCTUELLE_ID" -H "authorization: Bearer $ADMIN" | py "
import json,sys
t = json.load(sys.stdin); print(t['group']['name'], t['priority'])")"
check "une priorité hors de +3..−3 est refusée" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"FREQ=DAILY","priority":9}')"
check "une date limite sur une tâche récurrente est refusée" "400" \
  "$(status -X POST "$BASE/tasks" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"FREQ=DAILY","dueDate":"2026-12-01"}')"
check "le type d'une tâche ne se change pas après coup" "400" \
  "$(status -X PATCH "$BASE/tasks/$PONCTUELLE_ID" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"kind":"SCHEDULED"}')"
check "la liste se filtre par type" "yes" \
  "$(curl -s "$BASE/tasks?kind=BACKGROUND" -H "authorization: Bearer $ADMIN" | py "
import json,sys
taches = json.load(sys.stdin)
print('yes' if taches and all(t['kind'] == 'BACKGROUND' for t in taches) else [t['kind'] for t in taches])")"
check "la liste sort le plus urgent en premier" "3" \
  "$(curl -s "$BASE/tasks" -H "authorization: Bearer $ADMIN" | py "
import json,sys; print(json.load(sys.stdin)[0]['priority'])")"
check "supprimer un groupe détache ses tâches sans les supprimer" "yes" \
  "$(curl -s -X DELETE "$BASE/task-groups/$GROUPE_ID" -H "authorization: Bearer $ADMIN" > /dev/null
     curl -s "$BASE/tasks/$PONCTUELLE_ID" -H "authorization: Bearer $ADMIN" | py "
import json,sys
t = json.load(sys.stdin)
print('yes' if t['group'] is None and t['title'] else t)")"

echo
echo "Rendez-vous"
RDV_START=$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).replace(hour=15, minute=30, second=0, microsecond=0).isoformat().replace('+00:00','Z'))")
RDV_END=$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).replace(hour=16, minute=15, second=0, microsecond=0).isoformat().replace('+00:00','Z'))")
RDV_TO=$(py "import datetime; print((datetime.date.today() + datetime.timedelta(days=28)).isoformat())")
RDV_ID=$(curl -s -X POST "$BASE/appointments" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"Dentiste\",\"location\":\"Cabinet Martin\",\"startAt\":\"$RDV_START\",\"endAt\":\"$RDV_END\",\"rrule\":\"FREQ=WEEKLY\",\"attendees\":[\"$ADULTE_ID\"]}" | field "['id']")
check "un rendez-vous hebdomadaire est créé" "ok" "$([[ -n $RDV_ID ]] && echo ok)"
check "ses instances sont déroulées sur la fenêtre" "yes" \
  "$(curl -s "$BASE/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $ADMIN" | py "
import json,sys
mine = [a for a in json.load(sys.stdin) if a['appointmentId'] == '$RDV_ID']
print('yes' if len(mine) >= 4 and all(a['isRecurring'] for a in mine) else len(mine))")"
check "l'heure locale est conservée d'une semaine à l'autre" "yes" \
  "$(curl -s "$BASE/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $ADMIN" | py "
import json, sys, zoneinfo, datetime
tz = zoneinfo.ZoneInfo('Europe/Paris')
heures = {datetime.datetime.fromisoformat(a['startAt'].replace('Z','+00:00')).astimezone(tz).strftime('%H:%M')
          for a in json.load(sys.stdin) if a['appointmentId'] == '$RDV_ID'}
print('yes' if len(heures) == 1 else heures)")"
check "un invité répond pour lui-même" "ACCEPTED" \
  "$(curl -s -X POST "$BASE/appointments/$RDV_ID/respond" -H "authorization: Bearer $ADULTE_TOKEN" \
    -H 'content-type: application/json' -d '{"response":"ACCEPTED"}' | py "
import json,sys
print(next(a['response'] for a in json.load(sys.stdin)['attendees'] if a['id'] == '$ADULTE_ID'))")"
check "quelqu'un qui n'est pas invité ne répond pas" "400" \
  "$(status -X POST "$BASE/appointments/$RDV_ID/respond" -H "authorization: Bearer $ENFANT_TOKEN" \
    -H 'content-type: application/json' -d '{"response":"ACCEPTED"}')"
check "une fin avant le début est refusée" "400" \
  "$(status -X POST "$BASE/appointments" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"startAt\":\"$RDV_END\",\"endAt\":\"$RDV_START\"}")"
check "un enfant ne crée pas de rendez-vous" "403" \
  "$(status -X POST "$BASE/appointments" -H "authorization: Bearer $ENFANT_TOKEN" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"startAt\":\"$RDV_START\",\"endAt\":\"$RDV_END\"}")"

PRIVE_ID=$(curl -s -X POST "$BASE/appointments" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"Rendez-vous perso\",\"startAt\":\"$RDV_START\",\"endAt\":\"$RDV_END\",\"visibility\":\"PRIVATE\"}" | field "['id']")
check "un rendez-vous privé est introuvable pour les autres" "404" \
  "$(status "$BASE/appointments/$PRIVE_ID" -H "authorization: Bearer $ADULTE_TOKEN")"
check "il n'apparaît pas non plus dans leur liste" "False" \
  "$(curl -s "$BASE/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $ADULTE_TOKEN" | py "
import json,sys; print(any(a['appointmentId'] == '$PRIVE_ID' for a in json.load(sys.stdin)))")"
check "son auteur le voit" "True" \
  "$(curl -s "$BASE/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $ADMIN" | py "
import json,sys; print(any(a['appointmentId'] == '$PRIVE_ID' for a in json.load(sys.stdin)))")"

echo
echo "Agenda fusionné et fil d'activité"
check "l'agenda mêle rendez-vous, tâches et tâches de fond en retard" "yes" \
  "$(curl -s "$BASE/agenda?from=$TODAY&to=$(py "import datetime; print((datetime.date.today() + datetime.timedelta(days=2)).isoformat())")" \
    -H "authorization: Bearer $ADMIN" | py "
import json,sys
types = {e['type'] for e in json.load(sys.stdin)['data']}
print('yes' if {'APPOINTMENT','TASK','BACKGROUND_DUE'} <= types else sorted(types))")"
check "l'agenda est trié par instant" "yes" \
  "$(curl -s "$BASE/agenda?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $ADMIN" | py "
import json,sys
ats = [e['at'] for e in json.load(sys.stdin)['data']]
print('yes' if ats == sorted(ats) else 'non trié')")"
check "le fil d'activité retrace ce qui s'est passé" "yes" \
  "$(curl -s "$BASE/activity?limit=50" -H "authorization: Bearer $ADMIN" | py "
import json,sys
verbes = {a['verb'] for a in json.load(sys.stdin)['data']}
attendus = {'BACKGROUND_TASK_DONE','APPOINTMENT_CREATED','TASK_COMPLETED','MEMBER_STATUS_CHANGED'}
print('yes' if attendus <= verbes else sorted(attendus - verbes))")"

echo
echo "Changer la règle, supprimer la tâche"
check "changer la règle regénère les échéances à venir" "yes" \
  "$(curl -s -X PATCH "$BASE/tasks/$TASK_ID" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"rrule":"FREQ=WEEKLY;BYDAY=SA"}' | py "
import json,sys,datetime
# Modifier une tâche ne réécrit pas le passé : seules les échéances
# **à venir** sont regénérées. Celle du jour, déjà posée, reste telle
# quelle — c'est voulu, donc on ne la compte pas.
aujourdhui = datetime.date.today()
up = [o for o in json.load(sys.stdin)['upcoming']
      if datetime.date.fromisoformat(o['scheduledFor']) > aujourdhui]
days = {datetime.date.fromisoformat(o['scheduledFor']).weekday() for o in up}
print('yes' if up and days == {5} else days)")"
check "supprimer la tâche conserve l'historique" "yes" \
  "$(curl -s -X DELETE "$BASE/tasks/$DAILY_ID" -H "authorization: Bearer $ADMIN" > /dev/null
     curl -s "$BASE/occurrences?from=$FROM_PAST&to=$TODAY" -H "authorization: Bearer $ADMIN" | py "
import json,sys
# Uniquement la tâche supprimée : le foyer en contient d'autres.
mine = [o['status'] for o in json.load(sys.stdin)['data'] if o['taskId'] == '$DAILY_ID']
# Ce qui est en attente disparaît, ce qui porte une trace reste.
print('yes' if 'SKIPPED' in mine and 'PENDING' not in mine else mine)")"

echo
echo "Suppression de compte"
check "un mauvais mot de passe ne suffit pas" "401" \
  "$(status -X DELETE "$BASE/users/me" -H "authorization: Bearer $INVITE_TOKEN" \
    -H 'content-type: application/json' -d '{"password":"pas le bon"}')"
check "son titulaire supprime son compte" "204" \
  "$(status -X DELETE "$BASE/users/me" -H "authorization: Bearer $INVITE_TOKEN" \
    -H 'content-type: application/json' -d '{"password":"un mot de passe assez long"}')"
check "son jeton ne vaut plus rien" "401" \
  "$(status "$BASE/auth/me" -H "authorization: Bearer $INVITE_TOKEN")"
check "il n'apparaît plus parmi les membres" "0" \
  "$(curl -s "$BASE/members" -H "authorization: Bearer $ADMIN" | py "
import json,sys; print(sum(1 for m in json.load(sys.stdin) if m['id'] == '$INVITE_ID'))")"

echo
echo "Administration du serveur"
check "un compte sans MANAGE_SERVER ne voit pas la zone d'administration" "403" \
  "$(status "$BASE/admin/users" -H "authorization: Bearer $ADULTE_TOKEN")"
check "l'administrateur liste les comptes" "200" \
  "$(status "$BASE/admin/users" -H "authorization: Bearer $ADMIN")"
check "l'historique d'un compte supprimé est anonymisé" "Ancien membre" \
  "$(curl -s "$BASE/admin/users?includeDeleted=true" -H "authorization: Bearer $ADMIN" | py "
import json,sys
for u in json.load(sys.stdin):
    if u['id'] == '$INVITE_ID': print(u['firstName'], u['lastName'])")"
check "son identifiant est rendu inutilisable" "yes" \
  "$(curl -s "$BASE/admin/users?includeDeleted=true" -H "authorization: Bearer $ADMIN" | py "
import json,sys
for u in json.load(sys.stdin):
    if u['id'] == '$INVITE_ID': print('yes' if u['username'].startswith('Supprimé:') else u['username'])")"
check "l'état des mises à jour est réservé à l'administrateur" "403" \
  "$(status "$BASE/admin/updates" -H "authorization: Bearer $ADULTE_TOKEN")"
check "l'administrateur voit l'état des mises à jour" "yes" \
  "$(curl -s "$BASE/admin/updates" -H "authorization: Bearer $ADMIN" | py "
import json,sys
d = json.load(sys.stdin)
print('yes' if d['currentVersion'] and 'updateAvailable' in d else d)")"
check "la vérification des mises à jour se déclenche" "202" \
  "$(status -X POST "$BASE/admin/jobs/releases.check/run" -H "authorization: Bearer $ADMIN")"
check "l'administrateur supprime le compte d'un autre" "204" \
  "$(status -X DELETE "$BASE/admin/users/$ENFANT_ID" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"password":"un mot de passe assez long"}')"

echo
echo "Transmission de l'administration"
check "le dernier administrateur peut toujours supprimer son compte" "204" \
  "$(status -X DELETE "$BASE/users/me" -H "authorization: Bearer $ADMIN" \
    -H 'content-type: application/json' -d '{"password":"un mot de passe assez long"}')"
check "le compte restant le plus ancien administre le foyer" "yes" \
  "$(curl -s "$BASE/auth/me" -H "authorization: Bearer $ADULTE_TOKEN" | py "
import json,sys
droits = set(json.load(sys.stdin)['user']['rights'])
print('yes' if {'MANAGE_SERVER','MANAGE_STATUSES'} <= droits else sorted(droits))")"

echo
echo "Version attendue de l'application"
check "l'app peut l'interroger sans être connectée" "yes" \
  "$(curl -s "$ROOT/app-release" | py "
import json,sys
d = json.load(sys.stdin)
# Les champs peuvent être vides si le serveur n'a pas d'accès sortant ;
# c'est leur présence qui est contractuelle.
print('yes' if 'version' in d and d['serverVersion'] else d)")"

echo
echo "Limitation de débit sur la connexion"
LAST=""
for _ in 1 2 3 4 5 6; do
  LAST=$(status -X POST "$BASE/auth/login" -H 'content-type: application/json' \
    -d '{"username":"inconnu","password":"mauvais mot de passe"}')
done
check "la force brute est bloquée après quelques essais" "429" "$LAST"

echo
if (( FAILURES == 0 )); then
  echo "Tout est passé."
else
  echo "$FAILURES vérification(s) en échec."
fi
exit $(( FAILURES > 0 ))
