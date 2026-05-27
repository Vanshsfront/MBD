#!/usr/bin/env bash
# Phase 9 production-handoff gate. Runs every smoke + lint + build in
# sequence; fails fast on first red. Used as the canonical "is this ready
# to ship?" check.

set -euo pipefail

# Resolve repo root relative to this script so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    # shellcheck disable=SC2046
    export $(grep -E '^DATABASE_URL=' .env | sed 's/"//g' | xargs)
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[run-all-smokes] FATAL: DATABASE_URL not set and not found in .env" >&2
  exit 2
fi

# Order matters: schema-touching smokes first, then end-to-end smokes that
# depend on seed data being intact.
SMOKES=(
  "smoke-prisma.ts"            # baseline DB connectivity + audit roundtrip
  "smoke-templates.ts"         # XLSX invoice rendering + sample DOCX
  "smoke-followups.ts"         # 11 clinical templates render with sample data
  "smoke-consent.ts"           # COMMON_PATIENT_INTAKE_FORM consent render
  "smoke-consent-on-behalf.ts" # FO intake-on-behalf + error-mapper coverage
  "smoke-clinical.ts"          # Phase 4 — structured Physiotherapy Consultation roundtrip
  "smoke-change-requests.ts"   # Phase 3 — auto-mutate Approve roundtrip
  "smoke-billing.ts"           # Phase 5 — Manual + Products + recommendations + inventory consume
  "smoke-multiclinic.ts"       # Phase 6 — static-grep + per-centre isolation
  "smoke-admin.ts"             # Phase 7 — services import idempotency + attendance
  "smoke-portal.ts"            # Phase 8 — token gates + notification branching
  "smoke-acceptance.ts"        # Phase 9 — nav ⇔ canAccessRoute + PRD §4 journey contract
)

pass=0
fail=0
total_start=$(date +%s)

for smoke in "${SMOKES[@]}"; do
  echo
  echo "▸ $smoke"
  start=$(date +%s)
  if npx tsx "scripts/$smoke" > /tmp/mbd-smoke.log 2>&1; then
    elapsed=$(( $(date +%s) - start ))
    pass=$((pass + 1))
    # Headline lines for the summary; full output stays in the temp log.
    # Pipe with `|| true` so a no-match doesn't trip pipefail.
    { grep -E "PASS ✅|done|wrote|all 6" /tmp/mbd-smoke.log || true; } | tail -3
    echo "  ✅ $smoke (${elapsed}s)"
  else
    elapsed=$(( $(date +%s) - start ))
    fail=$((fail + 1))
    echo "  ❌ $smoke (${elapsed}s) — output:"
    sed 's/^/      /' /tmp/mbd-smoke.log | tail -30
    break
  fi
done

if [[ $fail -gt 0 ]]; then
  echo
  echo "[run-all-smokes] FAIL: $fail smoke(s) failed; halted." >&2
  exit 1
fi

echo
echo "▸ npm run lint"
start=$(date +%s)
if npm run lint > /tmp/mbd-lint.log 2>&1; then
  echo "  ✅ lint ($(( $(date +%s) - start ))s)"
else
  echo "  ❌ lint:"
  sed 's/^/      /' /tmp/mbd-lint.log | tail -50
  exit 1
fi

echo
echo "▸ npm run build"
start=$(date +%s)
if npm run build > /tmp/mbd-build.log 2>&1; then
  echo "  ✅ build ($(( $(date +%s) - start ))s)"
else
  echo "  ❌ build:"
  sed 's/^/      /' /tmp/mbd-build.log | tail -60
  exit 1
fi

total_elapsed=$(( $(date +%s) - total_start ))
echo
echo "[run-all-smokes] PASS ✅ ($pass smoke scripts + lint + build) in ${total_elapsed}s"
