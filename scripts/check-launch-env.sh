#!/usr/bin/env bash
set -u

OPTIONAL_VARS=(
  RESEND_API_KEY
  ANTHROPIC_API_KEY
)

failures=0

pass() {
  printf '[PASS] %s\n' "$1"
}

warn() {
  printf '[WARN] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  failures=$((failures + 1))
}

get_var() {
  local name="$1"
  printf '%s' "${!name-}"
}

validate_non_empty_required() {
  local name="$1"
  local value
  value="$(get_var "$name")"

  if [ -z "$value" ]; then
    fail "$name is missing or empty"
  else
    pass "$name is set"
  fi
}

validate_app_url() {
  local value
  value="$(get_var APP_URL)"

  if [ -z "$value" ]; then
    fail "APP_URL is missing or empty"
    return
  fi

  if [[ "$value" =~ ^https://[^[:space:]]+$ ]]; then
    pass "APP_URL uses https:// and appears absolute"
  else
    fail "APP_URL must be an absolute https:// URL"
  fi
}

validate_optional_secret() {
  local name="$1"
  local value
  value="$(get_var "$name")"

  if [ -z "$value" ]; then
    warn "$name not set (feature disabled)"
  else
    pass "$name is set"
  fi
}

printf 'Checking launch environment configuration...\n'

validate_app_url
validate_non_empty_required GOOGLE_CLOUD_API_KEY
validate_non_empty_required SIGNING_SECRET

for var_name in "${OPTIONAL_VARS[@]}"; do
  validate_optional_secret "$var_name"
done

if [ "$failures" -gt 0 ]; then
  printf '\nLaunch environment check FAILED (%d issue%s).\n' "$failures" "$( [ "$failures" -eq 1 ] && printf '' || printf 's' )"
  exit 1
fi

printf '\nLaunch environment check PASSED.\n'
