#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BASE_URL:-}" ]; then
  printf '[FAIL] BASE_URL is required\n'
  printf 'Usage: BASE_URL="https://your-host" bash scripts/smoke/smoke-report-flow.sh\n'
  exit 1
fi

BASE_URL="${BASE_URL%/}"
AUTH_HEADER="${SMOKE_AUTH_HEADER:-}"

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  exit 1
}

run_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"

  local response_file
  response_file="$(mktemp)"

  local -a args
  args=(
    -sS
    -o "$response_file"
    -w '%{http_code}'
    -X "$method"
    "$BASE_URL$path"
    -H 'Content-Type: application/json'
  )

  if [ -n "$AUTH_HEADER" ]; then
    args+=(-H "$AUTH_HEADER")
  fi

  if [ -n "$payload" ]; then
    args+=(--data "$payload")
  fi

  local status
  status="$(curl "${args[@]}")" || {
    rm -f "$response_file"
    fail "Request failed for $method $path"
  }

  local body
  body="$(cat "$response_file")"
  rm -f "$response_file"

  printf '%s\n%s' "$status" "$body"
}

extract_json_field() {
  local field_path="$1"
  node -e '
const fs = require("fs");
const path = process.argv[1].split(".");
let value = JSON.parse(fs.readFileSync(0, "utf8"));
for (const key of path) {
  value = value?.[key];
}
if (value === undefined || value === null || value === "") process.exit(1);
process.stdout.write(String(value));
' "$field_path"
}

expect_status() {
  local expected_status="$1"
  local actual_status="$2"
  local label="$3"
  local body="$4"

  if [ "$actual_status" != "$expected_status" ]; then
    fail "$label returned HTTP $actual_status (expected $expected_status): $body"
  fi
}

printf 'Running smoke flow against %s\n' "$BASE_URL"

# 1) Health
health_result="$(run_request GET /api/health)"
health_status="$(printf '%s' "$health_result" | head -n1)"
health_body="$(printf '%s' "$health_result" | tail -n +2)"
expect_status 200 "$health_status" 'Health check' "$health_body"
health_value="$(printf '%s' "$health_body" | extract_json_field status 2>/dev/null || true)"
[ "$health_value" = "ok" ] || fail "Health check payload missing status=ok"
pass 'Health check'

# 2) Create assignment
assignment_payload='{"requiredLineCount":2,"expectedStyle":"print","paperType":"either","numbering":{"required":false},"expectedContent":{"mode":"perLine","lines":["Smoke line 1","Smoke line 2"]}}'
assignment_result="$(run_request POST /api/assignment "$assignment_payload")"
assignment_status="$(printf '%s' "$assignment_result" | head -n1)"
assignment_body="$(printf '%s' "$assignment_result" | tail -n +2)"
expect_status 201 "$assignment_status" 'Create assignment' "$assignment_body"
assignment_id="$(printf '%s' "$assignment_body" | extract_json_field assignmentId 2>/dev/null || true)"
[ -n "$assignment_id" ] || fail 'Create assignment response missing assignmentId'
pass 'Create assignment'

# 3) Retrieve assignment
get_assignment_result="$(run_request GET "/api/assignment/$assignment_id")"
get_assignment_status="$(printf '%s' "$get_assignment_result" | head -n1)"
get_assignment_body="$(printf '%s' "$get_assignment_result" | tail -n +2)"
expect_status 200 "$get_assignment_status" 'Retrieve assignment' "$get_assignment_body"
verified="$(printf '%s' "$get_assignment_body" | extract_json_field verified 2>/dev/null || true)"
[ "$verified" = "true" ] || fail 'Retrieve assignment response missing verified=true'
pass 'Retrieve assignment'

# 4) Upload report (synthetic encrypted payload)
now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
report_payload="{\"ciphertextB64\":\"c21va2UtY2lwaGVydGV4dA\",\"nonceB64\":\"c21va2Utbm9uY2U\",\"meta\":{\"createdAt\":\"$now_iso\",\"size\":32}}"
upload_result="$(run_request POST /api/report "$report_payload")"
upload_status="$(printf '%s' "$upload_result" | head -n1)"
upload_body="$(printf '%s' "$upload_result" | tail -n +2)"
expect_status 201 "$upload_status" 'Upload report' "$upload_body"
report_id="$(printf '%s' "$upload_body" | extract_json_field reportId 2>/dev/null || true)"
[ -n "$report_id" ] || fail 'Upload report response missing reportId'
pass 'Upload report'

# 5) Retrieve report
get_report_result="$(run_request GET "/api/report/$report_id")"
get_report_status="$(printf '%s' "$get_report_result" | head -n1)"
get_report_body="$(printf '%s' "$get_report_result" | tail -n +2)"
expect_status 200 "$get_report_status" 'Retrieve report' "$get_report_body"
ciphertext="$(printf '%s' "$get_report_body" | extract_json_field ciphertextB64 2>/dev/null || true)"
[ -n "$ciphertext" ] || fail 'Retrieve report response missing ciphertextB64'
pass 'Retrieve report'

printf '\nSmoke flow PASSED\n'
