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
shops (deploy order is in the plan, section 5); the desktop release workflow
deploys the VPS itself first (see "Deploy from GitHub Actions").
The same order applies to Phase 9's device endpoints even without a migration:
deploy `/api/device/accounts` and the link endpoint's `expectedBranchId` check
before distributing the desktops that depend on them.

Phase 10.1 adds outbox trigger migrations. The MySQL service now enables
`log_bin_trust_function_creators=1`, allowing the database-scoped migration
account to create triggers with binary logging enabled. Recreate MySQL with
the updated Compose command before running these migrations (the `up -d`
above applies that command change while retaining the data volume). Bundled
desktop MySQL already disables binary logging.

## Deploy from GitHub Actions

The **Deploy online** workflow (`.github/workflows/deploy-online.yml`) runs the
steps above on the VPS over SSH, then waits until `online-web` is healthy, which
only happens after MySQL, the migrations and `online-api` all succeeded. If the
site does not become healthy, the run fails and prints the last log lines.

An ordinary push to `main` deploys nothing. Deploys happen:

- **On demand**, for changes outside the desktop app (online site, API, shared
  code, Docker): GitHub → **Actions** → **Deploy online** (left sidebar) →
  **Run workflow** → branch `main` → **Run workflow**. Or from a terminal:

  ```powershell
  gh workflow run deploy-online.yml
  ```

- **Automatically before every desktop release.** Pushing a `desktop-vX.Y.Z`
  tag first deploys that commit to the VPS; the installer is built and published
  only if the deploy succeeded, so database changes always reach the VPS before
  the shop PCs (D16).

Only commits on `main` are deployed, one deploy at a time. The VPS folder must
stay on `main` with no local edits: the workflow fast-forwards it and stops
instead of overwriting anything.

### Everyday commands

```powershell
gh workflow run deploy-online.yml                    # deploy main to the VPS now
gh run list --workflow deploy-online.yml --limit 5   # recent deploys and their result
gh run watch                                         # follow a running deploy live
gh run view --log-failed                             # why the last failed run failed
gh run list --workflow desktop-release.yml --limit 5 # recent desktop releases
gh release view desktop-v0.2.5                       # what a release published
```

`gh run watch` and `gh run view` ask which run when given no ID; pass one from
`gh run list` to skip the question.

### One-time setup

The workflow logs in as `root` with a key used for nothing else. Run on the VPS,
one at a time:

```bash
ssh-keygen -t ed25519 -N "" -C github-deploy -f /root/.ssh/github-deploy
cat /root/.ssh/github-deploy.pub >> /root/.ssh/authorized_keys
cat /root/.ssh/github-deploy        # the private key, for VPS_SSH_KEY below
cat /etc/ssh/ssh_host_ed25519_key.pub   # the server's host key, for VPS_KNOWN_HOSTS
```

Then add four repository secrets (GitHub → **Settings** → **Secrets and
variables** → **Actions**, or `gh secret set NAME` and paste the value):

| Secret            | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `VPS_HOST`        | the VPS address used with `ssh` (SSH on port 22)                                               |
| `VPS_USER`        | `root`                                                                                         |
| `VPS_SSH_KEY`     | the whole private key, `-----BEGIN` to `END-----` lines included                               |
| `VPS_KNOWN_HOSTS` | `VPS_HOST`, a space, then the first two words of the host key line, e.g. `1.2.3.4 ssh-ed25519 AAAA…` |

After the private key is saved as a secret, delete it from the VPS with
`rm /root/.ssh/github-deploy` (the `.pub` line in `authorized_keys` stays).
`git fetch` on the VPS must already work without a password prompt. To revoke
GitHub's access, remove the `github-deploy` line from
`/root/.ssh/authorized_keys`.

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

## Reading the settings

`.env.production` is a dotenv file, not a shell script, so `source`ing it is
wrong. So is reading it with `grep`/`cut`: that leaves quotes attached to the
value and cannot tell a quote _around_ a password from a quote _inside_ it, and
it silently ignores interpolation and the project's own defaults.

**Do not read it on the host at all.** Compose has already parsed it with its
own rules and given the resolved values to the `mysql` container, so every
command below runs inside that container and uses `$MYSQL_DATABASE`,
`$MYSQL_USER` and `$MYSQL_ROOT_PASSWORD` from there. Those are the values the
containers actually run with, so there is nothing on the host to get wrong, no
name to mistype, and no password in a command line or in your shell history.

## Database backup

Include `--events` as well as `--routines --triggers` so a dump carries every
object the restore is expected to bring back.

```bash
mkdir -p backups
DUMP="backups/cashier-$(date +%F-%H%M%S).sql"
echo "$DUMP"
```

Keep `$DUMP` in this shell for the next step.

```bash
sudo docker compose --env-file .env.production exec -T mysql sh -c \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction \
    --routines --triggers --events "$MYSQL_DATABASE"' > "$DUMP"
echo "exit: $?  file: $DUMP"
```

`exit: 0` is the first check. A non-zero exit means the dump did not run to
completion; stop here.

**Check that the dump is complete before relying on it.** `mysqldump` writes
`-- Dump completed` as its last line, so its absence means the dump was cut
short and would restore a partial database:

```bash
tail -n 1 "$DUMP"
```

Keep going only if that line begins `-- Dump completed`. Check `$DUMP`, the
variable you set above: a freshly generated filename is a different file as
soon as the clock ticks over.

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

Keep the `mysql_data` volume. The volume holds the database _files_, and
dropping the database is the recovery step; deleting the volume is not.

One command at a time, and check each result before continuing.

**1. Stop the services that use the database, and keep a dump of the current
state so this is reversible:**

```bash
sudo docker compose --env-file .env.production stop online-web online-api
```

```bash
mkdir -p backups
SAFETY="backups/before-restore-$(date +%F-%H%M%S).sql"
echo "$SAFETY"
```

Keep `$SAFETY` in this shell; the next command must check that exact file.

```bash
sudo docker compose --env-file .env.production exec -T mysql sh -c \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction \
    --routines --triggers --events "$MYSQL_DATABASE"' > "$SAFETY"
echo "exit: $?  file: $SAFETY"
```

```bash
tail -n 1 "$SAFETY"
```

Do not go on unless the exit code above was `0` **and** this last line begins
`-- Dump completed`. This dump is the only thing that makes the next step
reversible.

**2. Replace the database with an empty one, and give the application user
access to it.** The character set and collation are read from the database being
replaced rather than assumed, so the recreated database is the one the dump was
taken from. Read them **before** the drop, because afterwards they are gone:

```bash
sh scripts/database-recreate.sh .env.production
echo "exit: $?"
```

It prints the character set and collation it read, then the `DROP`, `CREATE`
and `GRANT`. **Check both lines.** If it stops before the drop with a message
about the collation, stop and fix the database name in `.env.production` — it
does not guess a collation. If `exit:` is not `0`, the database is in an
unknown state and the dump has not been imported; do not continue to step 3.

**3. Import the chosen dump into the empty database:**

```bash
sudo docker compose --env-file .env.production exec -T mysql sh -c \
  'mysql -u root -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
  < backups/selected-dump.sql
echo "exit: $?"
```

A non-zero exit here means the import failed. Do not run the migrations: fix
the import first, or restore again from `$SAFETY`.

**4. Verify the restore before starting anything.** A leftover table from a
half-applied migration is the failure this procedure exists to prevent:

```bash
sudo docker compose --env-file .env.production exec -T mysql sh -c '
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE" -e "
    SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations;
    SELECT table_name FROM information_schema.tables
      WHERE table_schema = DATABASE() ORDER BY table_name;
    SELECT COUNT(*) AS branches FROM branches;
    SELECT COUNT(*) AS orders FROM orders;"'
```

Compare the table list against the dump, the checkpoint against the migration
the dump was taken at, and the row counts against what the site last showed.

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
