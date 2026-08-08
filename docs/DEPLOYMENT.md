# GoSpots production deployment

GoSpots runs as three production services:

| Part | Host | Notes |
|---|---|---|
| Web (`apps/web`) | Vercel | Next.js, canonical host `www.gospots.eu` |
| API (`apps/api`) | Render | NestJS long-running API |
| Database | Neon / managed PostgreSQL | Prisma migrations only in production |

The browser uses a same-origin `/api/v1/*` path on Vercel. Next.js proxies those requests to Render, which keeps authentication cookies first-party from the browser's perspective.

## Canonical domains

Production canonical URL is:

```text
https://www.gospots.eu
```

The web configuration permanently redirects these alternate hosts while preserving the path:

```text
https://gospots.eu      -> https://www.gospots.eu
https://gospots.pl      -> https://www.gospots.eu
https://www.gospots.pl  -> https://www.gospots.eu
```

Set on Vercel:

```text
NEXT_PUBLIC_SITE_URL=https://www.gospots.eu
NEXT_PUBLIC_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://gospots-api.onrender.com
```

`API_PROXY_TARGET` is mandatory for a production build when `NEXT_PUBLIC_API_BASE_URL` is relative. Production builds deliberately fail instead of silently deploying a broken API proxy.

## Database

Use a PostgreSQL connection string with TLS, for example:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

Production starts with:

```bash
cd apps/api
npx prisma migrate deploy
node dist/main.js
```

Do not use `prisma db push` in production. All schema changes belong under `apps/api/prisma/migrations/`.

The Render readiness endpoint is:

```text
GET /api/v1/ready
```

Readiness verifies database connectivity and, when billing is enabled, verifies that the billing schema exists and the configured default billing provider has its required credentials.

## Render API configuration

The root `render.yaml` is the source of truth for non-secret flags. Secret values remain in Render Environment.

Required base configuration:

```text
NODE_ENV=production
DATABASE_URL=<postgres connection string>
JWT_ACCESS_SECRET=<long random secret>
WEB_APP_URL=https://www.gospots.eu
WEB_ORIGIN=https://www.gospots.eu
CORS_ORIGINS=https://www.gospots.eu,https://gospots.eu,https://www.gospots.pl,https://gospots.pl
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
CSRF_PROTECTION=true
RESEND_API_KEY=<secret>
MAIL_FROM=<verified sender>
MAIL_FROM_NAME=GoSpots
```

Never commit real values from Render.

## Stripe billing

Stripe is the production SaaS billing provider. The production flags are:

```text
BILLING_ENABLED=true
BILLING_STRIPE_ENABLED=true
BILLING_MOLLIE_ENABLED=false
BILLING_DEFAULT_PROVIDER=STRIPE
BILLING_LEMON_ENABLED=false
BILLING_LEMON_LEGACY_CHECKOUT=false
```

Required Stripe secrets in Render:

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Webhook endpoint:

```text
https://gospots-api.onrender.com/api/v1/billing/webhooks/stripe
```

Do **not** configure `STRIPE_API_VERSION` in Render. The installed Stripe SDK selects its compatible API version.

`STRIPE_PRICE_MAP` is optional. Leaving it unset is valid: GoSpots creates Stripe Checkout line items from the server-calculated quote with inline `price_data`. If a Price ID is configured, the Stripe adapter validates that it exists in the current account, is active and recurring, has the requested currency, and exactly matches the server quote. Invalid/stale Price IDs fall back to inline pricing instead of taking checkout down.

Stored Stripe customer IDs are also validated before reuse. A missing/deleted customer or an ID from an old Stripe account is replaced automatically during checkout and the returned customer ID is persisted by the billing orchestrator.

## Billing pricing source of truth

The backend is authoritative for amounts charged. Checkout never trusts a price sent by the browser.

The server quote is built from:

```text
apps/api/src/common/venue-packs.ts
apps/api/src/modules/billing/billing-catalog.service.ts
```

The subscription UI receives totals from the API. Frontend catalog metadata is presentation data; Stripe checkout always receives the backend quote.

## Vercel web deployment

Import the repository in Vercel with:

```text
Root Directory: apps/web
Framework: Next.js
```

Required production variables:

```text
NEXT_PUBLIC_SITE_URL=https://www.gospots.eu
NEXT_PUBLIC_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://gospots-api.onrender.com
```

The app intentionally refuses a production same-origin configuration without `API_PROXY_TARGET`. Localhost fallbacks exist only in development.

## Search / crawler files

Next.js generates:

```text
/robots.txt
/sitemap.xml
```

Both use the canonical `.eu` URL. The sitemap includes public venue pages returned by the API and does not include dashboard/auth routes.

## Local development

Typical local setup:

```text
Web: http://localhost:3000
API: http://localhost:4000/api/v1
```

Localhost fallbacks are development-only and are never used by production URL resolution.

## Deployment checklist

Before production deployment:

- all Prisma migrations are committed;
- Render has `DATABASE_URL`, `JWT_ACCESS_SECRET`, `WEB_APP_URL`, mail secrets, and Stripe secrets;
- Stripe dual billing is enabled and Lemon/Mollie are disabled unless deliberately being used;
- Vercel has `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_BASE_URL`, and `API_PROXY_TARGET`;
- `/api/v1/ready` returns `status: ok`;
- `/sitemap.xml` uses `https://www.gospots.eu` URLs;
- `.pl` and bare `.eu` hosts redirect to `https://www.gospots.eu`;
- no `.env` or production secrets are committed.

## Troubleshooting

### Checkout returns 500 before Stripe creates a Session

Check Render logs and `/api/v1/ready`. Common pre-provider causes are an unapplied billing migration, a missing billing provider configuration, or database/idempotency errors. Checkout does not force an external FX refresh and stale Stripe customer/Price IDs are self-healed/fallback-safe.

### Login works locally but not in production

Confirm:

```text
NEXT_PUBLIC_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://gospots-api.onrender.com
COOKIE_SAME_SITE=lax
COOKIE_SECURE=true
```

### Render build fails with EROFS around pnpm

Use the repository `render.yaml`. It installs pnpm with npm and does not run `corepack enable`.

### First request after idle is slow

The Render free service may cold-start. This is a hosting characteristic, not an application checkout timeout.
