#!/bin/sh
# Recreates the database empty, with the character set and collation it already
# has, and gives the application user access again.
#
# Everything happens inside the mysql container, where Compose has already
# resolved the settings and where the collation still exists. Reading the
# collation on the host would mean two levels of quoting to hand it back, and a
# wrong quote there turns the statement into something else entirely — so the
# collation is read and used in the same shell that drops the database, and
# never leaves the container.
#
# The dump is imported by the runbook after this, so the order is: verify the
# dump, recreate, import, verify.
#
# Usage: sh scripts/database-recreate.sh .env.production
set -eu

env_file=${1:?usage: database-recreate.sh ENV_FILE}

sudo docker compose --env-file "$env_file" exec -T mysql sh -c '
set -eu
case $MYSQL_DATABASE in
  "" | *[!A-Za-z0-9_]*)
    echo "unexpected database name: $MYSQL_DATABASE" >&2
    exit 1
    ;;
esac
# 0x09 is a tab, so the separator survives a shell with no $'"'"'\t'"'"'.
row=$(mysql -N -B -u root -p"$MYSQL_ROOT_PASSWORD" -e "
  SELECT CONCAT(DEFAULT_CHARACTER_SET_NAME, 0x09, DEFAULT_COLLATION_NAME)
    FROM information_schema.SCHEMATA
   WHERE SCHEMA_NAME = \"$MYSQL_DATABASE\";")
if [ -z "$row" ]; then
  echo "could not read the character set of $MYSQL_DATABASE; not guessing one" >&2
  exit 1
fi
charset=$(printf "%s" "$row" | cut -f1)
collation=$(printf "%s" "$row" | cut -f2)
for value in "$charset" "$collation"; do
  case $value in
    "" | *[!A-Za-z0-9_]*)
      echo "unexpected collation value: $value" >&2
      exit 1
      ;;
  esac
done
echo "recreating $MYSQL_DATABASE as $charset / $collation"
mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "
  DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`;
  CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET $charset COLLATE $collation;
  GRANT ALL ON \`$MYSQL_DATABASE\`.* TO '"'"'$MYSQL_USER'"'"'@'"'"'%'"'"';
  FLUSH PRIVILEGES;"
'