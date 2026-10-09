# Docker operations runbook

Cashier runs as the `cashier-app` Compose project with four services:

- `online-web`: the reports site, Next.js standalone on `127.0.0.1:3010`
- `online-api`: the read-only API, Express on `127.0.0.1:4010`
- `mysql`: private MySQL 8.4 database
- `migrate`: one-shot Drizzle migration job

There is no point-of-sale service on the server. Each shop PC keeps its own
database and uploads to this one (Phase 10); the online site never changes
business data.

Run every command from `/root/cashier`. Always provide `.env.production`
explicitly:

```bash
cd /root/cashier
sudo docker compose --env-file .env.production COMMAND
```

## Settings (`.env.production` on the VPS)

The file stays on the VPS and is never committed. It needs exactly these keys:

| Key                   | Meaning                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `MYSQL_DATABASE`      | database name (default `cashier`)                                                                       |
| `MYSQL_USER`          | application database user (default `cashier`)                                                           |
| `MYSQL_PASSWORD`      | password of that user                                                                                   |
| `MYSQL_ROOT_PASSWORD` | root password of the container                                                                          |
| `DATABASE_URL`        | `mysql://<MYSQL_USER>:<MYSQL_PASSWORD>@mysql:3306/<MYSQL_DATABASE>` — host `mysql`, the Compose service |
| `JWT_SECRET`          | at least 32 characters, random, not the example value                                                   |
| `CORS_ORIGIN`         | exactly `https://cashier.biscofa.tech`                                                                  |
| `ADMIN_NAME`          | display name of the super-admin                                                                         |
| `ADMIN_USERNAME`      | super-admin username                                                                                    |
| `ADMIN_PASSWORD`      | super-admin password                                                                                    |

`PORT` and `TRUST_PROXY` are fixed by Compose (`4000`, `true`). The old
`EXTERNAL_ORDERS_*` and `EXTERNAL_CATALOG_ENABLED` keys are no longer read by
anything and can be deleted.

## Status and health

```bash
sudo docker compose --env-file .env.production ps
```

Verify both services on the VPS itself:

```bash
curl --fail http://127.0.0.1:4010/health
curl --fail --head http://127.0.0.1:3010/
```

The API answers `{"ok":true}`; `/health` is unauthenticated and safe on its
loopback port. The `migrate` service shows `Exited (0)` after completing; that
is its normal healthy state.

`migrate` has a liveness healthcheck
(`node /app/packages/db/scripts/process-liveness.cjs drizzle-kit`). It reports
`healthy` only while another process runs `drizzle-kit`: normal runs finish in
seconds and show `Exited (0)`, while `unhealthy` means the container kept
running for over a minute with no migration process (check its logs). The probe
sees a dead process, not a wedged one.

## First deploy (replacing the old online cashier)

The old `api`, `web` and `cache-worker` services are gone from this repository.
Their containers may still exist on the VPS as orphans; remove them once the new
stack is up (see below).

```bash
git pull
sudo docker compose --env-file .env.production config --quiet
sudo docker compose --env-file .env.production build
sudo docker compose --env-file .env.production up -d
sudo docker compose --env-file .env.production ps
```

Compose refuses to interpolate without the file, so `--env-file
.env.production` belongs on **every** `docker compose` command; a bare
`docker compose ps` fails with "MYSQL_PASSWORD is required".

Then, once the site answers, drop the leftover containers by name — Compose no
longer knows those service names and answers `no such service`:

```bash
sudo docker rm -f cashier-app-web-1 cashier-app-api-1 cashier-app-cache-worker-1
sudo docker image prune
```

To start from an empty database instead of the old cashier data, remove the
volume **before** the first `up -d` (this deletes everything in it):

```bash
sudo docker compose --env-file .env.production down
sudo docker volume rm cashier-app_mysql_data
```

## Nginx

The host Nginx terminates TLS and forwards to the two loopback ports. The live
site at `/etc/nginx/sites-available/cashier` already does this (verified
2026-10-08), so **check it before changing anything**:

```bash
grep -n "server_name\|proxy_pass\|client_max_body_size" /etc/nginx/sites-available/cashier
```

What has to be true:

- `location /` → `http://127.0.0.1:3010` (online-web)
- `location /api/` → `http://127.0.0.1:4010` (online-api). The site calls
  `/api` on its own origin, so without this block signing in cannot work.
- `client_max_body_size` of at least `4m`, leaving room for the Phase 10
  upload batches (the live file has `10m`).
- the Certbot `listen 443 ssl` and certificate lines, which must not be touched.

Only if a line is missing, add it inside the existing `server` block for
`cashier.biscofa.tech`:

```nginx
client_max_body_size 4m;

location /api/ {
    proxy_pass http://127.0.0.1:4010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # online-api runs with TRUST_PROXY=true so the session cookie is Secure.
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Deploy an update

```bash
git pull
sudo docker compose --env-file .env.production config --quiet
sudo docker compose --env-file .env.production build
sudo docker compose --env-file .env.production up -d
sudo docker compose --env-file .env.production ps
```

The MySQL volume is retained across builds and container replacements. Compose
waits for MySQL, runs pending migrations, then starts the API and the site. A
release that adds a migration must reach the VPS **before** it is pushed to the
shops (deploy order is in the plan, section 5).

## Super-admin account

`online-api` synchronizes the super-admin from `.env.production` on every start:

- Empty database: creates the account from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
- Changed name, username, or password: applied automatically; a password change
  logs everyone out.
- Unchanged values: silent no-op, nobody is logged out.
- Deactivation is never managed from the environment file.

Apply new credentials with:

```bash
sudo docker compose --env-file .env.production up -d --force-recreate online-api
```

Cashiers cannot sign in on the online site at all; the sign-in screen offers no
cashier choice.

## Start, stop, and restart

```bash
sudo docker compose --env-file .env.production up -d
sudo docker compose --env-file .env.production restart online-api
sudo docker compose --env-file .env.production restart online-web
sudo docker compose --env-file .env.production stop online-web online-api
sudo docker compose --env-file .env.production start online-api online-web
sudo docker compose --env-file .env.production down
```

Never add `--volumes` to the `down` command in production. It deletes the
persistent MySQL data.

## Logs

```bash
sudo docker compose --env-file .env.production logs --follow --tail=200
sudo docker compose --env-file .env.production logs --tail=200 mysql migrate
sudo docker compose --env-file .env.production logs --tail=200 online-api online-web
sudo docker compose --env-file .env.production logs --since=30m online-api
```

Container logs rotate automatically at 10 MB with three retained files per
service.

## Common failures

### `migrate` exits with a nonzero status

```bash
sudo docker compose --env-file .env.production logs --tail=300 mysql migrate
```

MySQL DDL does not roll back, so inspect the logs and the partial schema before
retrying. Do not edit an applied SQL migration: add a new one and redeploy.

### online-api is unhealthy or will not start

```bash
sudo docker compose --env-file .env.production logs --tail=300 online-api
```

`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
and the database credentials must all exist in `.env.production`. A missing or
malformed value stops the process with a message naming the key. After changing
the file, recreate the service instead of merely restarting it:

```bash
sudo docker compose --env-file .env.production up -d --force-recreate online-api online-web
```

### The site loads but signing in fails

`CORS_ORIGIN` must list the exact browser origin
(`https://cashier.biscofa.tech`); browsers reject credentialed cookie requests
to an unlisted origin. `TRUST_PROXY=true` must stay on, because TLS terminates
at Nginx and the session cookie only becomes `Secure` behind the proxy.

### Nginx returns `502 Bad Gateway`

```bash
curl --fail http://127.0.0.1:4010/health
curl --fail --head http://127.0.0.1:3010/
sudo docker compose --env-file .env.production ps
sudo nginx -t
```

### A host port is already allocated

```bash
sudo ss -lntp | grep -E ':(3010|4010)\b'
```

Only this Compose project should bind those ports, and both must stay on
`127.0.0.1`.

## Database backup

Include `--events` as well as `--routines --triggers` so a dump carries every
object the restore is expected to bring back. Read the values with `grep`/`cut`
rather than `source`-ing the file, which is not safe when a value contains
spaces:

```bash
mkdir -p backups
DB=$(grep -E '^MYSQL_DATABASE=' .env.production | cut -d= -f2)
ROOT_PW=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env.production | cut -d= -f2- | tr -d '"')
```

```bash
sudo docker compose --env-file .env.production exec -T mysql \
  mysqldump -u root -p"$ROOT_PW" --single-transaction \
  --routines --triggers --events "$DB" \
  > "backups/cashier-$(date +%F-%H%M%S).sql"
unset ROOT_PW
```

A dump stored only on the same VPS is not a complete backup: copy it off the
server regularly.

## Database restore

Restoring replaces live database state. Take a new backup first and do it in a
maintenance window.

Never import a dump into the existing database. A dump only drops and recreates
the tables it contains, so a table created by a migration that failed halfway
survives the import. Migrating again then fails on that leftover table, and the
database is not the state the backup describes. Always drop and recreate the
target database first, then import into it.

Keep the `mysql_data` volume. The volume holds the database *files*, and
dropping the database is the recovery step; deleting the volume is not.

One command at a time, and check each result before continuing. `.env.production`
is not shell-safe to `source` if any value contains spaces, so read the values
you need through `grep`/`cut` instead.

**1. Stop the services that use the database, and keep a dump of the current
state so this is reversible:**

```bash
sudo docker compose --env-file .env.production stop online-web online-api
```

```bash
DB=$(grep -E '^MYSQL_DATABASE=' .env.production | cut -d= -f2)
ROOT_PW=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env.production | cut -d= -f2- | tr -d '"')
APP_USER=$(grep -E '^MYSQL_USER=' .env.production | cut -d= -f2)
echo "$DB / $APP_USER"
```

```bash
sudo docker compose --env-file .env.production exec -T mysql \
  mysqldump -u root -p"$ROOT_PW" --single-transaction --routines --triggers \
  --events "$DB" > "backups/before-restore-$(date +%F-%H%M%S).sql"
unset ROOT_PW
```

**2. Replace the database with an empty one of the same character set and
collation, and give the application user access to it.** Re-read the values each
step needs, so the password is not left sitting in the shell between commands:

```bash
DB=$(grep -E '^MYSQL_DATABASE=' .env.production | cut -d= -f2)
ROOT_PW=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env.production | cut -d= -f2- | tr -d '"')
APP_USER=$(grep -E '^MYSQL_USER=' .env.production | cut -d= -f2)
```

```bash
sudo docker compose --env-file .env.production exec -T mysql \
  mysql -u root -p"$ROOT_PW" -e "
    DROP DATABASE IF EXISTS \`$DB\`;
    CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    GRANT ALL ON \`$DB\`.* TO '$APP_USER'@'%';
    FLUSH PRIVILEGES;"
unset ROOT_PW APP_USER
```

**3. Import the chosen dump into the empty database:**

```bash
DB=$(grep -E '^MYSQL_DATABASE=' .env.production | cut -d= -f2)
ROOT_PW=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env.production | cut -d= -f2- | tr -d '"')
```

```bash
sudo docker compose --env-file .env.production exec -T mysql \
  mysql -u root -p"$ROOT_PW" --default-character-set=utf8mb4 "$DB" \
  < backups/selected-dump.sql
unset ROOT_PW
```

**4. Verify the restore before starting anything.** A leftover table from a
half-applied migration is the failure this procedure exists to prevent:

```bash
DB=$(grep -E '^MYSQL_DATABASE=' .env.production | cut -d= -f2)
ROOT_PW=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env.production | cut -d= -f2- | tr -d '"')
```

```bash
sudo docker compose --env-file .env.production exec -T mysql \
  mysql -u root -p"$ROOT_PW" "$DB" -e "
    SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations;
    SELECT table_name FROM information_schema.tables
      WHERE table_schema = DATABASE() ORDER BY table_name;"
unset ROOT_PW
```

Compare the table list against the dump, and the checkpoint against the
migration the dump was taken at. Then check known rows:

```bash
DB=$(grep -E '^MYSQL_DATABASE=' .env.production | cut -d= -f2)
ROOT_PW=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env.production | cut -d= -f2- | tr -d '"')
```

```bash
sudo docker compose --env-file .env.production exec -T mysql \
  mysql -u root -p"$ROOT_PW" --default-character-set=utf8mb4 "$DB" -e "
    SELECT COUNT(*) AS branches FROM branches;
    SELECT COUNT(*) AS orders FROM orders;"
unset ROOT_PW
```

Only then run the migrations and start the services:

```bash
sudo docker compose --env-file .env.production up -d --force-recreate migrate online-api online-web
```

## Disk usage and safe cleanup

```bash
sudo docker system df
sudo du -sh /var/lib/docker
sudo docker builder prune
sudo docker image prune
```

Review every prompt before confirming. Never prune volumes on the production
VPS.
