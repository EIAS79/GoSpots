# VenueFlow

Multi-tenant SaaS for gaming venues, dining reservations, menu orders, and finance.

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

## Production preview (Vercel)

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for:

- Vercel (frontend)
- Render (API)
- Neon (database)
- Environment variables and API proxy setup

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run API + web |
| `pnpm build` | Build both apps |
| `pnpm build:web` | Build Next.js only |
| `pnpm build:api` | Build Nest API only |
