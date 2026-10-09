#!/bin/sh
# Prints the requested keys from a Compose env file as shell assignments that
# can be `eval`ed. dotenv values are not shell words: quotes are part of the
# value, so `KEY="cashier"` names the database `"cashier"` and stripping every
# `"` with `tr -d '"'` also destroys a quote inside a password. Compose itself
# reads these files with dotenv rules, so this does too.
#
# Usage: eval "$(scripts/read-prod-env.sh .env.production MYSQL_DATABASE MYSQL_ROOT_PASSWORD)"
#
# A key that the file does not set falls back to the Compose default, which is
# what Compose would use anyway. A key that is neither set nor defaulted is an
# error, so a typo cannot silently become an empty password or database name.
set -eu

file=${1:?usage: read-prod-env.sh ENV_FILE [KEY...]}
[ -r "$file" ] || { echo "cannot read $file" >&2; exit 1; }
shift

# The defaults Compose applies for this project (docs/docker.md, Settings).
default_for() {
  case $1 in
    MYSQL_DATABASE | MYSQL_USER) printf 'cashier' ;;
    *) printf '' ;;
  esac
}

read_value() {
  key=$1
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file" \
    | tail -n 1) || true
  if [ -z "$line" ]; then
    default_for "$key"
    return
  fi
  value=${line#*=}
  # Trim whitespace around the value, then remove one matching pair of
  # surrounding quotes. Only matching pairs: a quote inside the value stays.
  value=$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  case $value in
    \"*\")
      value=${value#\"}
      value=${value%\"}
      ;;
    \'*\')
      value=${value#\'}
      value=${value%\'}
      ;;
  esac
  printf '%s' "$value"
}

for key in "$@"; do
  value=$(read_value "$key")
  if [ -z "$value" ]; then
    echo "$key is not set in $file and has no default" >&2
    exit 1
  fi
  case $key in
    *[!A-Za-z0-9_]*)
      echo "not a valid key name: $key" >&2
      exit 1
      ;;
  esac
  # Single-quoted, with any single quote in the value closed, escaped, and
  # reopened, so the shell sees the value exactly as dotenv defines it.
  escaped=$(printf "%s" "$value" | sed "s/'/'\\\\''/g")
  printf "%s='%s'\n" "$key" "$escaped"
done