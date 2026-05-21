# GoSpots

Multi-tenant SaaS for gaming venues, dining reservations, menu orders, and finance.

Product name: **GoSpots**. API routes and env var names are unchanged from the VenueFlow setup.

## Stack

- **Web** — Next.js (`apps/web`)
- **API** — NestJS + Prisma (`apps/api`)
- **DB** — PostgreSQL

## Local development

```bash
pnpm install
pnpm db:setup    # Postgres + migrations (see scripts/)
pnpm dev         # API :4000 + Web :3000
```

Copy env templates:

- `apps/api/.env.example` → `apps/api/.env`
- `apps/web/.env.example` → `apps/web/.env.local`

## Production

Live stack: **Vercel** (web) + **Render** (API) + **Neon** (DB).

- **[docs/START-HERE.md](docs/START-HERE.md)** — your URLs, env vars, local dev, quick fixes
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — full deploy reference (first-time setup)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run API + web |
| `pnpm build` | Build both apps |
| `pnpm build:web` | Build Next.js only |
| `pnpm build:api` | Build Nest API only |
