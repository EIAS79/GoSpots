# VenueFlow — production preview (Vercel + hosted API + Postgres)

This monorepo has **three parts** in production:

| Part | Where to host | Why |
|------|----------------|-----|
| **Web** (`apps/web`) | [Vercel](https://vercel.com) | Next.js |
| **API** (`apps/api`) | [Render](https://render.com) (free tier) | NestJS long-running server + Sharp |
| **Database** | [Neon](https://neon.tech) or Supabase | Postgres (required; SQLite is not used in production) |

Vercel does not run the Nest API reliably; the web app **proxies** `/api/v1/*` to your API so login cookies work on your Vercel domain.

---

## 1. Database (Neon — recommended)

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (`postgresql://...`).
3. Use it as `DATABASE_URL` on the API host only.

After the API is deployed once, migrations run automatically (`prisma migrate deploy` on start). Locally you can also run:

```bash
cd apps/api
pnpm exec prisma migrate deploy
```

---

## 2. API on Render

1. Push the repo to **GitHub** (private is fine).
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect repo (uses root `render.yaml`),  
   **or** **New Web Service** → root directory `.` with:
   - **Build:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @venueflow/api exec prisma generate && pnpm --filter @venueflow/api run build`
   - **Start:** `cd apps/api && pnpm exec prisma migrate deploy && node dist/main.js`
   - **Health check path:** `/api/v1/health`

3. Environment variables (Render → Environment):

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon connection string |
| `JWT_ACCESS_SECRET` | long random string |
| `WEB_ORIGIN` | `https://your-app.vercel.app` |
| `CORS_ORIGIN` | same as `WEB_ORIGIN` (comma-separate multiple preview URLs) |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `none` (only if **not** using Vercel proxy; use `lax` with proxy) |

4. Note the public URL, e.g. `https://venueflow-api.onrender.com`.

---

## 3. Web on Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → import the GitHub repo.
2. **Root Directory:** `apps/web` (important).
3. Framework should detect **Next.js**; `apps/web/vercel.json` sets install/build for the monorepo.

4. Environment variables (Vercel → Settings → Environment Variables):

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |
| `API_PROXY_TARGET` | `https://venueflow-api.onrender.com` (no trailing slash) |

5. Deploy. Open the preview URL and register / log in.

### Preview URLs

Each Vercel preview gets a new hostname. Either:

- Add each preview URL to Render `CORS_ORIGIN` / `WEB_ORIGIN` (comma-separated), **or**
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

- Ensure `DATABASE_URL` is set before first deploy.
- Check Render logs for Prisma migrate errors.

**Cold start (free Render)**

- First request after idle can take ~30s; upgrade plan or use a cron ping if needed.

---

## Optional: custom domains

- Vercel: `app.yourdomain.com` → set `WEB_ORIGIN` / `CORS_ORIGIN` on Render to match.
- Render: `api.yourdomain.com` → update `API_PROXY_TARGET` on Vercel.
