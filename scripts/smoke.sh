#!/usr/bin/env bash
#
# Parcours de bout en bout contre un serveur qui tourne : inscription,
# rotation des jetons, création de foyer, invitation, rôles, isolation
# entre foyers, tâches récurrentes (récurrence, tour de rôle, complétion,
# jobs), compteurs de temps, rendez-vous, agenda fusionné, fil
# d'activité, suppression de compte avec transfert de propriété et
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
ADMIN_ID=$(echo "$ADMIN_JSON" | field "['user']['id']")
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
echo "Tâches récurrentes"
TASK_JSON=$(curl -s -X POST "$BASE/households/$HID/tasks" -H "authorization: Bearer $OWNER" \
  -H 'content-type: application/json' -d "{
    \"title\": \"Sortir les poubelles\",
    \"rrule\": \"FREQ=WEEKLY;BYDAY=MO\",
    \"dueTime\": \"19:00\",
    \"assignmentMode\": \"ROTATION\",
    \"assignees\": [\"$OWNER_ID\", \"$MEMBER_ID\"],
    \"points\": 2
  }")
TASK_ID=$(echo "$TASK_JSON" | field "['id']")
check "une tâche hebdomadaire en tour de rôle est créée" "ok" \
  "$([[ -n $TASK_ID ]] && echo ok)"
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
print('yes' if first != second and first == '$OWNER_ID' else f'{first} {second}')")"

check "un enfant ne crée pas de tâche" "403" \
  "$(status -X POST "$BASE/households/$HID/tasks" -H "authorization: Bearer $OUTSIDER" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"FREQ=DAILY"}')"
check "une récurrence plus fréquente qu'une fois par jour est refusée" "400" \
  "$(status -X POST "$BASE/households/$HID/tasks" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"FREQ=HOURLY"}')"
check "une règle illisible est refusée" "400" \
  "$(status -X POST "$BASE/households/$HID/tasks" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d '{"title":"X","rrule":"tous les lundis"}')"
check "un tour de rôle à une seule personne est refusé" "400" \
  "$(status -X POST "$BASE/households/$HID/tasks" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"rrule\":\"FREQ=DAILY\",\"assignmentMode\":\"ROTATION\",\"assignees\":[\"$OWNER_ID\"]}")"
check "un assigné hors du foyer est refusé" "400" \
  "$(status -X POST "$BASE/households/$HID/tasks" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"rrule\":\"FREQ=DAILY\",\"assignmentMode\":\"FIXED\",\"assignees\":[\"$ADMIN_ID\"]}")"

echo
echo "Faire, défaire, passer son tour"
TODAY=$(py "import datetime; print(datetime.date.today().isoformat())")
FROM_PAST=$(py "import datetime; print((datetime.date.today() - datetime.timedelta(days=3)).isoformat())")
DAILY_JSON=$(curl -s -X POST "$BASE/households/$HID/tasks" -H "authorization: Bearer $OWNER" \
  -H 'content-type: application/json' -d "{
    \"title\": \"Vider le lave-vaisselle\",
    \"rrule\": \"FREQ=DAILY\",
    \"dueTime\": \"09:00\",
    \"startsOn\": \"$FROM_PAST\",
    \"graceHours\": 0
  }")
DAILY_ID=$(echo "$DAILY_JSON" | field "['id']")
check "les jours écoulés sont rattrapés" "yes" \
  "$(curl -s "$BASE/households/$HID/occurrences?from=$FROM_PAST&to=$TODAY" \
    -H "authorization: Bearer $OWNER" | py "
import json,sys
mine = [o for o in json.load(sys.stdin)['data'] if o['taskDefinitionId'] == '$DAILY_ID']
print('yes' if len(mine) == 4 else len(mine))")"
if [[ "$ADMIN_AVAILABLE" == "yes" ]]; then
  echo
  echo "Balayages planifiés"
  check "un non-administrateur ne déclenche pas un job" "404" \
    "$(status -X POST "$BASE/admin/jobs/tasks.markMissed/run" -H "authorization: Bearer $MEMBER")"
  check "un nom de job inconnu est refusé" "400" \
    "$(status -X POST "$BASE/admin/jobs/tasks.inexistant/run" -H "authorization: Bearer $ADMIN")"
  check "l'administrateur déclenche le passage en « manquée »" "202" \
    "$(status -X POST "$BASE/admin/jobs/tasks.markMissed/run" -H "authorization: Bearer $ADMIN")"
  # Le job passe par Redis : on laisse au worker le temps de le traiter.
  check "la file traite le job et les échéances dépassées deviennent manquées" "yes" \
    "$(py "
import json, time, urllib.request
url = '$BASE/households/$HID/occurrences?from=$FROM_PAST&to=$TODAY'
for _ in range(20):
    time.sleep(0.25)
    req = urllib.request.Request(url, headers={'authorization': 'Bearer $OWNER'})
    try:
        data = json.loads(urllib.request.urlopen(req).read())
    except Exception:
        continue
    mine = [o for o in data['data'] if o['taskDefinitionId'] == '$DAILY_ID']
    if any(o['status'] == 'MISSED' for o in mine):
        print('yes'); break
else:
    print('aucune occurrence marquée manquée')")"
else
  echo
  echo "Balayages planifiés"
  echo "  — ignoré : déclencher un job demande un compte administrateur."
fi


OCC_ID=$(curl -s "$BASE/households/$HID/occurrences?from=$TODAY&to=$TODAY" -H "authorization: Bearer $OWNER" \
  | py "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])")
check "un enfant peut cocher une tâche" "DONE" \
  "$(curl -s -X POST "$BASE/households/$HID/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $OUTSIDER" -H 'content-type: application/json' -d '{}' | field "['status']")"
check "le même geste rejoué reste un succès" "200" \
  "$(status -X POST "$BASE/households/$HID/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $OUTSIDER" -H 'content-type: application/json' -d '{}')"
check "quelqu'un d'autre reçoit un conflit explicite" "409" \
  "$(status -X POST "$BASE/households/$HID/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{}')"
check "le conflit nomme qui l'a faite" "Lou" \
  "$(cat /tmp/mh-smoke-body | py "import json,sys; print(json.load(sys.stdin)['error']['details']['completedBy'])")"
check "décocher ramène en attente" "PENDING" \
  "$(curl -s -X POST "$BASE/households/$HID/occurrences/$OCC_ID/uncomplete" \
    -H "authorization: Bearer $OUTSIDER" | field "['status']")"
check "décocher une tâche non faite est refusé" "409" \
  "$(status -X POST "$BASE/households/$HID/occurrences/$OCC_ID/uncomplete" -H "authorization: Bearer $OUTSIDER")"
check "une action datée dans le futur est refusée" "400" \
  "$(status -X POST "$BASE/households/$HID/occurrences/$OCC_ID/complete" \
    -H "authorization: Bearer $OUTSIDER" -H 'content-type: application/json' \
    -d "{\"completedAt\":\"$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).isoformat())")\"}")"
check "passer son tour" "SKIPPED" \
  "$(curl -s -X POST "$BASE/households/$HID/occurrences/$OCC_ID/skip" \
    -H "authorization: Bearer $OUTSIDER" -H 'content-type: application/json' -d '{"note":"je suis malade"}' | field "['status']")"
check "un enfant ne réassigne pas" "403" \
  "$(status -X PATCH "$BASE/households/$HID/occurrences/$OCC_ID" -H "authorization: Bearer $OUTSIDER" \
    -H 'content-type: application/json' -d "{\"assigneeId\":\"$MEMBER_ID\"}")"
check "un adulte réassigne" "Paul" \
  "$(curl -s -X PATCH "$BASE/households/$HID/occurrences/$OCC_ID" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d "{\"assigneeId\":\"$MEMBER_ID\"}" | py "
import json,sys; print((json.load(sys.stdin)['assignee'] or {}).get('displayName'))")"

echo
echo "Compteurs de temps"
COUNTER_ID=$(curl -s -X POST "$BASE/households/$HID/counters" -H "authorization: Bearer $OWNER" \
  -H 'content-type: application/json' \
  -d '{"title":"Changer les draps","targetIntervalSeconds":1209600}' | field "['id']")
check "un compteur est créé" "NEVER_DONE" \
  "$(curl -s "$BASE/households/$HID/counters/$COUNTER_ID" -H "authorization: Bearer $OWNER" | field "['status']")"
check "un enfant ne crée pas de compteur" "403" \
  "$(status -X POST "$BASE/households/$HID/counters" -H "authorization: Bearer $OUTSIDER" \
    -H 'content-type: application/json' -d '{"title":"X"}')"

OLD_EVENT=$(py "import datetime; print((datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=20)).isoformat().replace('+00:00','Z'))")
check "une action déclarée il y a vingt jours met le compteur en retard" "OVERDUE" \
  "$(curl -s -X POST "$BASE/households/$HID/counters/$COUNTER_ID/events" -H "authorization: Bearer $OUTSIDER" \
    -H 'content-type: application/json' -d "{\"occurredAt\":\"$OLD_EVENT\"}" | field "['status']")"
check "le temps écoulé est renvoyé en secondes" "20" \
  "$(curl -s "$BASE/households/$HID/counters/$COUNTER_ID" -H "authorization: Bearer $OWNER" | py "
import json,sys; print(round(json.load(sys.stdin)['elapsedSeconds'] / 86400))")"

EVENT_UUID=$(py "import uuid; print(uuid.uuid4())")
curl -s -X POST "$BASE/households/$HID/counters/$COUNTER_ID/events" -H "authorization: Bearer $OUTSIDER" \
  -H 'content-type: application/json' -d "{\"id\":\"$EVENT_UUID\"}" > /dev/null
check "remettre à zéro repart de l'état OK" "OK" \
  "$(curl -s "$BASE/households/$HID/counters/$COUNTER_ID" -H "authorization: Bearer $OWNER" | field "['status']")"
curl -s -X POST "$BASE/households/$HID/counters/$COUNTER_ID/events" -H "authorization: Bearer $OUTSIDER" \
  -H 'content-type: application/json' -d "{\"id\":\"$EVENT_UUID\"}" > /dev/null
check "le même événement rejoué n'en crée pas un second" "2" \
  "$(curl -s "$BASE/households/$HID/counters/$COUNTER_ID/events" -H "authorization: Bearer $OWNER" | py "
import json,sys; print(len(json.load(sys.stdin)['data']))")"
check "une action datée dans le futur est refusée" "400" \
  "$(status -X POST "$BASE/households/$HID/counters/$COUNTER_ID/events" -H "authorization: Bearer $OUTSIDER" \
    -H 'content-type: application/json' \
    -d "{\"occurredAt\":\"$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).isoformat().replace('+00:00','Z'))")\"}")"

LAST_EVENT=$(curl -s "$BASE/households/$HID/counters/$COUNTER_ID/events" -H "authorization: Bearer $OWNER" | py "
import json,sys; print(json.load(sys.stdin)['data'][0]['id'])")
check "supprimer une saisie erronée recalcule l'état" "OVERDUE" \
  "$(status -X DELETE "$BASE/households/$HID/counters/$COUNTER_ID/events/$LAST_EVENT" -H "authorization: Bearer $OUTSIDER" > /dev/null
     curl -s "$BASE/households/$HID/counters/$COUNTER_ID" -H "authorization: Bearer $OWNER" | field "['status']")"

echo
echo "Rendez-vous"
RDV_START=$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).replace(hour=15, minute=30, second=0, microsecond=0).isoformat().replace('+00:00','Z'))")
RDV_END=$(py "import datetime; print((datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)).replace(hour=16, minute=15, second=0, microsecond=0).isoformat().replace('+00:00','Z'))")
RDV_TO=$(py "import datetime; print((datetime.date.today() + datetime.timedelta(days=28)).isoformat())")
RDV_ID=$(curl -s -X POST "$BASE/households/$HID/appointments" -H "authorization: Bearer $OWNER" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"Dentiste\",\"location\":\"Cabinet Martin\",\"startAt\":\"$RDV_START\",\"endAt\":\"$RDV_END\",\"rrule\":\"FREQ=WEEKLY\",\"attendees\":[\"$MEMBER_ID\"]}" | field "['id']")
check "un rendez-vous hebdomadaire est créé" "ok" "$([[ -n $RDV_ID ]] && echo ok)"
check "ses instances sont déroulées sur la fenêtre" "yes" \
  "$(curl -s "$BASE/households/$HID/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $OWNER" | py "
import json,sys
mine = [a for a in json.load(sys.stdin) if a['appointmentId'] == '$RDV_ID']
print('yes' if len(mine) >= 4 and all(a['isRecurring'] for a in mine) else len(mine))")"
check "l'heure locale est conservée d'une semaine à l'autre" "yes" \
  "$(curl -s "$BASE/households/$HID/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $OWNER" | py "
import json, sys, zoneinfo, datetime
tz = zoneinfo.ZoneInfo('Europe/Paris')
heures = {datetime.datetime.fromisoformat(a['startAt'].replace('Z','+00:00')).astimezone(tz).strftime('%H:%M')
          for a in json.load(sys.stdin) if a['appointmentId'] == '$RDV_ID'}
print('yes' if len(heures) == 1 else heures)")"
check "un invité répond pour lui-même" "ACCEPTED" \
  "$(curl -s -X POST "$BASE/households/$HID/appointments/$RDV_ID/respond" -H "authorization: Bearer $MEMBER" \
    -H 'content-type: application/json' -d '{"response":"ACCEPTED"}' | py "
import json,sys
print(next(a['response'] for a in json.load(sys.stdin)['attendees'] if a['id'] == '$MEMBER_ID'))")"
check "quelqu'un qui n'est pas invité ne répond pas" "400" \
  "$(status -X POST "$BASE/households/$HID/appointments/$RDV_ID/respond" -H "authorization: Bearer $OUTSIDER" \
    -H 'content-type: application/json' -d '{"response":"ACCEPTED"}')"
check "une fin avant le début est refusée" "400" \
  "$(status -X POST "$BASE/households/$HID/appointments" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"startAt\":\"$RDV_END\",\"endAt\":\"$RDV_START\"}")"
check "un invité hors du foyer est refusé" "400" \
  "$(status -X POST "$BASE/households/$HID/appointments" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d "{\"title\":\"X\",\"startAt\":\"$RDV_START\",\"endAt\":\"$RDV_END\",\"attendees\":[\"$ADMIN_ID\"]}")"

PRIVE_ID=$(curl -s -X POST "$BASE/households/$HID/appointments" -H "authorization: Bearer $OWNER" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"Rendez-vous perso\",\"startAt\":\"$RDV_START\",\"endAt\":\"$RDV_END\",\"visibility\":\"PRIVATE\"}" | field "['id']")
check "un rendez-vous privé est introuvable pour les autres" "404" \
  "$(status "$BASE/households/$HID/appointments/$PRIVE_ID" -H "authorization: Bearer $MEMBER")"
check "il n'apparaît pas non plus dans leur liste" "False" \
  "$(curl -s "$BASE/households/$HID/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $MEMBER" | py "
import json,sys; print(any(a['appointmentId'] == '$PRIVE_ID' for a in json.load(sys.stdin)))")"
check "son auteur le voit" "True" \
  "$(curl -s "$BASE/households/$HID/appointments?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $OWNER" | py "
import json,sys; print(any(a['appointmentId'] == '$PRIVE_ID' for a in json.load(sys.stdin)))")"

echo
echo "Agenda fusionné et fil d'activité"
check "l'agenda mêle rendez-vous, tâches et compteurs en retard" "yes" \
  "$(curl -s "$BASE/households/$HID/agenda?from=$TODAY&to=$(py "import datetime; print((datetime.date.today() + datetime.timedelta(days=2)).isoformat())")" \
    -H "authorization: Bearer $OWNER" | py "
import json,sys
types = {e['type'] for e in json.load(sys.stdin)['data']}
print('yes' if {'APPOINTMENT','TASK','COUNTER_DUE'} <= types else sorted(types))")"
check "l'agenda est trié par instant" "yes" \
  "$(curl -s "$BASE/households/$HID/agenda?from=$TODAY&to=$RDV_TO" -H "authorization: Bearer $OWNER" | py "
import json,sys
ats = [e['at'] for e in json.load(sys.stdin)['data']]
print('yes' if ats == sorted(ats) else 'non trié')")"
check "le fil d'activité retrace ce qui s'est passé" "yes" \
  "$(curl -s "$BASE/households/$HID/activity?limit=50" -H "authorization: Bearer $OWNER" | py "
import json,sys
verbes = {a['verb'] for a in json.load(sys.stdin)['data']}
attendus = {'COUNTER_RESET','APPOINTMENT_CREATED','TASK_COMPLETED','MEMBER_JOINED'}
print('yes' if attendus <= verbes else sorted(attendus - verbes))")"

echo
echo "Changer la règle, supprimer la tâche"
check "changer la règle regénère les échéances à venir" "yes" \
  "$(curl -s -X PATCH "$BASE/households/$HID/tasks/$TASK_ID" -H "authorization: Bearer $OWNER" \
    -H 'content-type: application/json' -d '{"rrule":"FREQ=WEEKLY;BYDAY=SA"}' | py "
import json,sys,datetime
up = json.load(sys.stdin)['upcoming']
days = {datetime.date.fromisoformat(o['scheduledFor']).weekday() for o in up}
print('yes' if up and days == {5} else days)")"
check "supprimer la tâche conserve l'historique" "yes" \
  "$(status -X DELETE "$BASE/households/$HID/tasks/$DAILY_ID" -H "authorization: Bearer $OWNER" > /dev/null
     curl -s "$BASE/households/$HID/occurrences?from=$FROM_PAST&to=$TODAY" \
       -H "authorization: Bearer $OWNER" | py "
import json,sys
# Uniquement la tâche supprimée : le foyer en contient d'autres.
mine = [o['status'] for o in json.load(sys.stdin)['data'] if o['taskDefinitionId'] == '$DAILY_ID']
# Ce qui est en attente disparaît, ce qui porte une trace reste.
print('yes' if 'SKIPPED' in mine and 'PENDING' not in mine else mine)")"

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
