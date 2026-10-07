# Cashier + Warehouse System

POS + inventory system with independent branch workspaces, each with a main warehouse and a cafe sub-warehouse.
Full specification: [docs/system-specs.md](docs/system-specs.md).

## Structure

```
apps/
  web/        Next.js frontend (Arabic RTL, Tailwind)
  api/        Express.js REST API (TypeScript, MySQL)
  desktop/    Tauri frontend + bundled local API/Node runtime
packages/
  db/         Schema, migrations, branch scoping, admin seeding (Drizzle ORM)
  shared/     Types/utilities shared between web and api
```

## Requirements

- Node.js >= 20.11
- pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- MySQL 8 (local or hosted)

For the Windows desktop app, install Rust (MSVC), Microsoft C++ Build Tools,
and WebView2. See [apps/desktop/README.md](apps/desktop/README.md) for the first
run and local database requirements. Run `pnpm configure:desktop` once to import
local settings. `pnpm dev:desktop` opens the app with its own API;
`pnpm build:desktop` builds the installer with frontend, API, and Node runtime.

## Setup

```bash
pnpm install
cp .env.example .env   # then edit DATABASE_URL, JWT_SECRET and deployment origins
```

## Commands (run from repo root — build/lint/test/typecheck go through Turborepo)

| Command                                        | What it does                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                     | Runs API (port 4000) and web (port 3000) together (`turbo run dev`)     |
| `pnpm dev:api` / `pnpm dev:web`                | Run one app only                                                        |
| `pnpm dev:desktop`                             | Open the desktop app with its owned API and development frontend        |
| `pnpm build:desktop`                           | Build the shared package, frontend, and desktop installer through Turbo |
| `pnpm lint:desktop` / `pnpm typecheck:desktop` | Run desktop Rust checks through Turbo                                   |
| `pnpm test:desktop` / `pnpm smoke:desktop`     | Test desktop lifecycle and the bundled offline runtime                  |
| `pnpm configure:desktop`                       | Import local settings into the desktop user-data folder once            |
| `pnpm version:desktop patch`                   | Bump desktop release versions; also accepts minor or major              |
| `pnpm build`                                   | Build all workspaces (`turbo run build`)                                |
| `pnpm test`                                    | Run all tests with Vitest (`turbo run test`)                            |
| `pnpm lint`                                    | Lint all workspaces (`turbo run lint`)                                  |
| `pnpm typecheck`                               | TypeScript and Rust checks across workspaces (`turbo run typecheck`)    |
| `pnpm format`                                  | Prettier write                                                          |

### Database (run in `packages/db`)

| Command                                    | What it does                                        |
| ------------------------------------------ | --------------------------------------------------- |
| `pnpm --filter @cashier/db db:generate`    | Generate SQL migrations from `src/schema.ts`         |
| `pnpm --filter @cashier/db db:migrate`     | Apply migrations                                     |
| `pnpm --filter @cashier/db db:push`        | Push schema directly (dev only)                      |
| `pnpm --filter @cashier/db db:studio`      | Browse the database in Drizzle Studio                |
| `pnpm --filter @cashier/api db:seed`       | Create the configured admin user if none exists      |

The schema, migrations, branch scoping and admin seeding live in
`packages/db`, so every API in the repo uses the same tables and the same
migration history.
