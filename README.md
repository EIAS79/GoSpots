# Locora

Multi-tenant SaaS for gaming centers, restaurants, and venues — host dashboard, public site, reservations, reviews, and contact.

Product name: **Locora**. Tagline: **Host every location.** npm package filters remain `@gospots/*` for now.

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
