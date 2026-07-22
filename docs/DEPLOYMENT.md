# GoSpots — production preview (Vercel + hosted API + Postgres)

This monorepo has **three parts** in production:

| Part | Where to host | Why |
|------|----------------|-----|
| **Web** (`apps/web`) | [Vercel](https://vercel.com) | Next.js |
| **API** (`apps/api`) | [Render](https://render.com) (free tier) | NestJS long-running server + Sharp |
| **Database** | [Neon](https://neon.tech) or Supabase | Postgres (required; SQLite is not used in production) |

Vercel does not run the Nest API reliably; the web app **proxies** `/api/v1/*` to your API so login cookies work on your Vercel domain.

---

## 1. Database (Neon)

1. [neon.tech](https://neon.tech) → your project → **Connect**.
2. Tab **Connection string** → copy the URI (must include `?sslmode=require`).
3. Paste into:
   - **Render** → `DATABASE_URL` (production API)
   - **Local** → `apps/api/.env` as `DATABASE_URL` (file is gitignored)

Template (no secrets in repo): `apps/api/.env.production.example`

Apply all migrations to Neon once (migrations are **PostgreSQL** — use Neon, not SQLite):

```bash
cd apps/api
# DATABASE_URL in apps/api/.env must point at Neon
pnpm exec prisma migrate deploy
```

Optional demo data:

```bash
pnpm run seed
```

After Render deploy, each start runs **`prisma migrate deploy` only** (no `db push`). Keep schema changes in migration files under `apps/api/prisma/migrations/`.

**Security:** Never commit `apps/api/.env`. Rotate your Neon password if it was shared in chat or screenshots.

---

## 2. API on Render

1. Push the repo to **GitHub** (private is fine).
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect repo (uses root `render.yaml`),  
   **or** **New Web Service** → root directory `.` with:
   - **Build:** `npm install -g pnpm@10.12.1 && pnpm install --frozen-lockfile && pnpm --filter @gospots/api exec prisma generate && pnpm --filter @gospots/api run build`  
     (Do **not** use `corepack enable` on Render — it fails with `EROFS` on `/usr/bin/pnpm`.)
   - **Start:** `cd apps/api && npx prisma migrate deploy && node dist/main.js`
   - **Health check path:** `/api/v1/ready` (DB readiness). `/live` and `/health` are liveness-only.

3. Environment variables (Render → Environment):

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon connection string |
| `JWT_ACCESS_SECRET` | long random string |
| `WEB_ORIGIN` | `https://your-app.vercel.app` |
| `WEB_APP_URL` | same as `WEB_ORIGIN` (password reset, checkout redirects, guest links) |
| `CORS_ORIGINS` | same as `WEB_ORIGIN` (preferred allowlist; comma-separate previews) |
| `CORS_ORIGIN` | legacy alias; merged with `CORS_ORIGINS` / `WEB_*` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `none` (only if **not** using Vercel proxy; use `lax` with proxy) |
| `RESEND_API_KEY` | Resend API key (required for email) |
| `MAIL_FROM` | Verified sender, e.g. `bookings@yourdomain.com` |
| `MAIL_FROM_NAME` | `GoSpots` |
| `LEMON_SQUEEZY_API_KEY` | Lemon Squeezy API key (required for paid checkout) |
| `LEMON_SQUEEZY_STORE_ID` | Store ID |
| `LEMON_SQUEEZY_VARIANT_ID` | Subscription variant ID |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Webhook signing secret |

4. Note the public URL, e.g. `https://gospots-api.onrender.com`.

---

## 3. Web on Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → import the GitHub repo.
2. **Root Directory:** **`apps/web`** (required). If this is empty (repo root), the build fails with “No Next.js version detected”.
3. Framework should detect **Next.js**; `apps/web/vercel.json` installs dependencies from the monorepo root and runs `pnpm --filter @gospots/web run build`.

4. Environment variables (Vercel → Settings → Environment Variables):

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |
| `API_PROXY_TARGET` | `https://gospots-api.onrender.com` (no trailing slash) |

5. Deploy. Open the preview URL and register / log in.

### Preview URLs

Each Vercel preview gets a new hostname. Either:

- Add each preview URL to Render `CORS_ORIGINS` / `CORS_ORIGIN` / `WEB_ORIGIN` (comma-separated), **or**
- Rely on the **proxy** (`/api/v1` + `API_PROXY_TARGET`) so the browser only talks to Vercel (recommended).

---

## 4. GitHub checklist (before first push)

- [ ] `.env` / `.env.local` are **not** committed (see `.gitignore`).
- [ ] No secrets in the repo.
- [ ] Postgres migrations are under `apps/api/prisma/migrations/`.
- [ ] Optional: run `pnpm build` locally to verify.

```bash
pnpm install
pnpm build
```

---

## 5. Local vs production

| | Local | Production preview |
|--|--------|---------------------|
| Web | `pnpm dev:web` → :3000 | Vercel |
| API | `pnpm dev:api` → :4000 | Render |
| DB | local Postgres / Docker | Neon |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000/api/v1` | `/api/v1` |
| Proxy | off | `API_PROXY_TARGET` → Render |

---

## 6. Troubleshooting

**Login works locally but not on Vercel**

- Set `NEXT_PUBLIC_API_BASE_URL=/api/v1` and `API_PROXY_TARGET` to your Render URL.
- Redeploy Vercel after changing env vars.

**Images broken**

- API must be up; media is served from `/api/v1/media/:id`.
- With proxy, images load from your Vercel domain automatically.

**API build fails on Render**

- **`EROFS: read-only file system, unlink '/usr/bin/pnpm'`** — remove `corepack enable` from the build command; use `npm install -g pnpm@10.12.1` instead (see root `render.yaml`).
- Ensure `DATABASE_URL` is set before first deploy.
- Check Render logs for Prisma migrate errors.

**Cold start (free Render)**

- First request after idle can take ~30s; upgrade plan or use a cron ping if needed.

---

## Optional: custom domains

- Vercel: `app.yourdomain.com` → set `WEB_ORIGIN` / `CORS_ORIGIN` on Render to match.
- Render: `api.yourdomain.com` → update `API_PROXY_TARGET` on Vercel.
