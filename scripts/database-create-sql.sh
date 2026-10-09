#!/bin/sh
# Reads a database's character set and collation from the live server and
# prints the SQL that recreates it.
#
# A restore drops the database and creates it again. A hard-coded collation
# there is a claim that every Cashier database uses one collation; reading it
# is the only way the recreated database is the database that was dumped. If
# it cannot be read, nothing is printed, so a restore never continues on a
# guessed collation.
#
# Usage: eval "$(sh scripts/database-create-sql.sh .env.production DB_NAME)"
set -eu

env_file=${1:?usage: database-create-sql.sh ENV_FILE DB_NAME}
database=${2:?usage: database-create-sql.sh ENV_FILE DB_NAME}

# Reaches an identifier position in generated SQL, so refuse rather than escape.
case $database in
  *[!A-Za-z0-9_]*)
    echo "unexpected character in the database name: $database" >&2
    exit 1
    ;;
esac

settings=$(sh "$(dirname "$0")/read-prod-env.sh" "$env_file" MYSQL_ROOT_PASSWORD)

row=$(sudo docker compose --env-file "$env_file" exec -T mysql \
  mysql -N -B -u root -p"$settings" -e \
  "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
     FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME = '$database';" 2>/dev/null) || row=""

if [ -z "$row" ]; then
  echo "could not read the character set of '$database'; not guessing one" >&2
  exit 1
fi

charset=${row%%$'\t'*}
collation=${row#*$'\t'}
case $charset in
  *[!A-Za-z0-9_]* | "") exit 1 ;;
esac
case $collation in
  *[!A-Za-z0-9_]* | "") exit 1 ;;
esac

printf 'CREATE DATABASE `%s` CHARACTER SET %s COLLATE %s;\n' \
  "$database" "$charset" "$collation"