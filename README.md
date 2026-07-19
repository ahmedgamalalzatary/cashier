# Cashier + Warehouse System

POS + inventory system for a cafe with a main warehouse and a cafe sub-warehouse.
Full specification: [docs/system-specs.md](docs/system-specs.md).

## Structure

```
apps/
  web/        Next.js frontend (Arabic RTL, Tailwind)
  api/        Express.js REST API (TypeScript, Drizzle ORM, MySQL)
packages/
  shared/     Types/utilities shared between web and api
```

## Requirements

- Node.js >= 20
- pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- MySQL 8 (local or hosted)

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then edit DATABASE_URL, JWT_SECRET
```

## Commands (run from repo root — build/lint/test/typecheck go through Turborepo)

| Command | What it does |
|---|---|
| `pnpm dev` | Runs API (port 4000) and web (port 3000) together (`turbo run dev`) |
| `pnpm dev:api` / `pnpm dev:web` | Run one app only |
| `pnpm build` | Build all workspaces (`turbo run build`) |
| `pnpm test` | Run all tests with Vitest (`turbo run test`) |
| `pnpm lint` | Lint all workspaces (`turbo run lint`) |
| `pnpm typecheck` | TypeScript check all workspaces (`turbo run typecheck`) |
| `pnpm format` | Prettier write |

### Database (run in `apps/api`)

| Command | What it does |
|---|---|
| `pnpm db:generate` | Generate SQL migrations from `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:push` | Push schema directly (dev only) |
| `pnpm db:studio` | Browse the database in Drizzle Studio |
