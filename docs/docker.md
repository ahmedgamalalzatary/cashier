# Docker operations runbook

MiniKoshk runs as the `cashier-app` Compose project with four services:

- `web`: Next.js on `127.0.0.1:3010`
- `api`: Express on `127.0.0.1:4010`
- `mysql`: private MySQL 8.4 database
- `migrate`: one-shot Drizzle migration job

Run every command from `/opt/minikoshk`. Always provide `.env.production` explicitly:

```bash
cd /opt/minikoshk
sudo docker compose --env-file .env.production COMMAND
```

## Status and health

Show service state and health:

```bash
sudo docker compose --env-file .env.production ps
```

Verify the application locally on the VPS:

```bash
curl --fail http://127.0.0.1:4010/health
curl --fail --head http://127.0.0.1:3010/
```

The API response should be `{"ok":true}`. The `migrate` service should show `Exited (0)` after completing; that is its normal healthy state.

## Deploy an update

```bash
git pull
sudo docker compose --env-file .env.production config --quiet
sudo docker compose --env-file .env.production build
sudo docker compose --env-file .env.production up -d
sudo docker compose --env-file .env.production ps
```

The persistent MySQL volume is retained across builds and container replacements. Compose waits for MySQL, runs pending migrations, starts the API, and then starts the web service.

## Start, stop, and restart

Start or reconcile the complete stack:

```bash
sudo docker compose --env-file .env.production up -d
```

Restart one service without touching MySQL:

```bash
sudo docker compose --env-file .env.production restart api
sudo docker compose --env-file .env.production restart web
```

Stop application traffic while leaving MySQL running:

```bash
sudo docker compose --env-file .env.production stop web api
```

Start application traffic again:

```bash
sudo docker compose --env-file .env.production start api web
```

Stop and remove containers and the project network while preserving the database volume:

```bash
sudo docker compose --env-file .env.production down
```

Never add `--volumes` to the `down` command in production. It deletes the persistent MySQL data.

## Logs

Follow all service logs:

```bash
sudo docker compose --env-file .env.production logs --follow --tail=200
```

Inspect selected services:

```bash
sudo docker compose --env-file .env.production logs --tail=200 mysql migrate
sudo docker compose --env-file .env.production logs --tail=200 api web
```

Show logs since a specific time:

```bash
sudo docker compose --env-file .env.production logs --since=30m api
sudo docker compose --env-file .env.production logs --since=2026-01-01T12:00:00 web
```

Container logs rotate automatically at 10 MB with three retained files per service.

## Common failures

### `migrate` exits with a nonzero status

Read both database and migration logs:

```bash
sudo docker compose --env-file .env.production logs --tail=300 mysql migrate
```

After correcting the database connection or migration problem, recreate the migration job and application services:

```bash
sudo docker compose --env-file .env.production up -d --force-recreate migrate api web
```

Do not edit an already-applied SQL migration. Add a new migration and redeploy.

### API is unhealthy

```bash
sudo docker compose --env-file .env.production logs --tail=300 api
sudo docker compose --env-file .env.production exec api node -e \
  "fetch('http://127.0.0.1:4000/health').then(async r=>console.log(r.status,await r.text()))"
```

Check that `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and the database credentials exist in `.env.production`. After changing the file, recreate the API instead of merely restarting it:

```bash
sudo docker compose --env-file .env.production up -d --force-recreate api web
```

### Web is unhealthy or shows an old API URL

`NEXT_PUBLIC_API_URL` is embedded during the web image build. Rebuild the web image after changing it:

```bash
sudo docker compose --env-file .env.production build --no-cache web
sudo docker compose --env-file .env.production up -d --force-recreate web
```

### MySQL is unhealthy

```bash
sudo docker compose --env-file .env.production logs --tail=300 mysql
sudo docker compose --env-file .env.production exec mysql \
  mysqladmin ping -u root -p
```

Do not delete or recreate the volume as a troubleshooting shortcut. Check disk space, memory, credentials, and MySQL logs first.

### Nginx returns `502 Bad Gateway`

Confirm both application ports respond on the VPS:

```bash
curl --fail http://127.0.0.1:4010/health
curl --fail --head http://127.0.0.1:3010/
sudo docker compose --env-file .env.production ps
```

If a container is unhealthy, inspect its logs. If both endpoints work, validate and reload host Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### A host port is already allocated

```bash
sudo ss -lntp | grep -E ':(3010|4010)\b'
```

Only this Compose project should bind those ports, and both bindings must remain on `127.0.0.1`.

## Database backup

Create a timestamped SQL dump outside the container:

```bash
set -a
. ./.env.production
set +a
mkdir -p backups
sudo docker compose --env-file .env.production exec -T mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE" \
  > "backups/cashier-$(date +%F-%H%M%S).sql"
unset MYSQL_ROOT_PASSWORD
```

Confirm that the dump exists and is not empty:

```bash
ls -lh backups/*.sql
```

Copy backups off the VPS regularly. A dump stored only on the same VPS is not a complete backup.

## Database restore

Restoring replaces live database state. Take a new backup first and perform the restore during a maintenance window:

```bash
set -a
. ./.env.production
set +a
sudo docker compose --env-file .env.production stop api web
sudo docker compose --env-file .env.production exec -T mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < backups/selected-dump.sql
sudo docker compose --env-file .env.production up -d --force-recreate migrate api web
unset MYSQL_ROOT_PASSWORD
```

Verify API health and inspect its logs after restoration.

## Disk usage and safe cleanup

Inspect Docker disk usage:

```bash
sudo docker system df
sudo du -sh /var/lib/docker
```

Remove only unused build cache and dangling images:

```bash
sudo docker builder prune
sudo docker image prune
```

Review every prompt before confirming. Do not run volume-pruning commands on the production VPS.
