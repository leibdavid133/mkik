#!/usr/bin/env bash
# ============================================================================
# Kamarai Tudástár - a két edge function élesítése és füsttesztje
#
# Előfeltétel (mind a négy környezeti változó kell):
#   export SUPABASE_ACCESS_TOKEN=sbp_...        # Supabase personal access token
#   export PROJECT_REF=...                      # a Supabase projekt hivatkozása
#   export RESEND_API_KEY=re_...                # Resend API kulcs
#   export NOTIFY_TO=leibdavid133@gmail.com     # ide jönnek az értesítések
#
# Futtatás:  bash tools/deploy.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SUPABASE_ACCESS_TOKEN:?hiányzik a SUPABASE_ACCESS_TOKEN}"
: "${PROJECT_REF:?hiányzik a PROJECT_REF}"
: "${RESEND_API_KEY:?hiányzik a RESEND_API_KEY}"
: "${NOTIFY_TO:?hiányzik a NOTIFY_TO}"

MAIL_FROM="${MAIL_FROM:-Kamarai Tudástár <kamara@lda-solution.com>}"
BASE="https://${PROJECT_REF}.supabase.co/functions/v1"

# A korábbi projekt DNS-szinten megszűnt, ezért mindig ellenőrizzük.
echo "== A projekt létezik-e =="
if ! host "${PROJECT_REF}.supabase.co" >/dev/null 2>&1; then
  echo "HIBA: ${PROJECT_REF}.supabase.co nem oldható fel. Rossz ref, vagy a projekt nem létezik." >&2
  exit 1
fi
echo "   rendben: ${PROJECT_REF}.supabase.co"

echo "== Functionök élesítése =="
for fn in mkik-log mkik-notify; do
  npx --yes supabase@latest functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt
done

echo "== Titkok beállítása =="
npx --yes supabase@latest secrets set --project-ref "$PROJECT_REF" \
  RESEND_API_KEY="$RESEND_API_KEY" \
  MKIK_NOTIFY_TO="$NOTIFY_TO" \
  MKIK_MAIL_FROM="$MAIL_FROM" >/dev/null
echo "   RESEND_API_KEY, MKIK_NOTIFY_TO, MKIK_MAIL_FROM beállítva"

echo "== Füstteszt =="
# Érvénytelen payload -> 400. Ez azt bizonyítja, hogy a function fut ÉS ellenőriz.
for fn in mkik-log mkik-notify; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 -X POST "$BASE/$fn" \
    -H "Content-Type: application/json" -d '{}')
  printf "   %-12s érvénytelen payload -> HTTP %s %s\n" "$fn" "$code" \
    "$([ "$code" = "400" ] && echo '(helyes)' || echo '(VÁRT: 400)')"
done

# Valódi naplóbejegyzés
code=$(curl -s -o /tmp/mkik_log.json -w "%{http_code}" -m 20 -X POST "$BASE/mkik-log" \
  -H "Content-Type: application/json" \
  -d '{"action":"insert","row":{"question":"füstteszt a deploy után","result":"nocov","user_name":"telepítő","client":"deploy-script"}}')
echo "   mkik-log     valódi bejegyzés -> HTTP $code $(cat /tmp/mkik_log.json 2>/dev/null | head -c 80)"

# Valódi e-mail
code=$(curl -s -o /tmp/mkik_mail.json -w "%{http_code}" -m 30 -X POST "$BASE/mkik-notify" \
  -H "Content-Type: application/json" \
  -d '{"action":"gap","query":"füstteszt: erre nincs fedezet","manual":true,"chamber":"MKIK (országos)","user":{"name":"Telepítő","role":"rendszergazda","email":"admin@mkik.hu"},"near":[]}')
echo "   mkik-notify  valódi e-mail    -> HTTP $code $(cat /tmp/mkik_mail.json 2>/dev/null | head -c 120)"

echo
echo "== Kész. A böngészőben élesítsd a frontendet: =="
echo "   backendEnable(\"$PROJECT_REF\")"
echo "   (vagy Admin -> Beállítások -> Közös napló és értesítések)"
echo
echo "Az SQL-t egyszer kell lefuttatni a Supabase dashboard SQL editorában:"
echo "   supabase/migrations/001_mkik.sql   majd   supabase/migrations/002_answer_kind.sql"
