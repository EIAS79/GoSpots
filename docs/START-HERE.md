# START HERE — fix your deploys (read this only)

You already have **GitHub** (`EIAS79/VenueFlow`), **Render** (`venueflow-api`), and **Vercel** (`venueflow`).  
Both hosts failed for known reasons. Follow the steps below **in order**.

```
Neon (DB)  ◄──  Render (API)  ◄──  Vercel (website + /api proxy)
```

---

## Your URLs (fill these in as you go)

| What | Your URL |
|------|----------|
| GitHub repo | `https://github.com/EIAS79/VenueFlow` |
| Render API | `https://venueflow-api-1a7o.onrender.com` |
| Vercel site | `https://____________.vercel.app` (copy from Vercel → Domains) |
| Health check | `https://venueflow-api-1a7o.onrender.com/api/v1/health` |

---

## DO THIS NOW (in order)

### 1 — Push the latest code from your PC (required)

The fixes (Render build without `corepack`, Vercel `apps/web` only) are on your computer but **may not be on GitHub yet**.

PowerShell:

```powershell
cd "D:\Programing\Projects\Web-Development\Gaming-SaaS"
git status
```

**`apps/api/.env` must NOT be listed.** If it is, do not commit it.

```powershell
git add render.yaml package.json .node-version apps/web/vercel.json docs/START-HERE.md docs/DEPLOYMENT.md
git add -u vercel.json
git commit -m "fix: Render pnpm build and Vercel apps/web deploy"
git push origin main
```

Wait until GitHub shows the new commit on `main`.

---

### 2 — Fix Render API and redeploy

#### A) Update build commands (pick ONE way)

**Way 1 — Easiest: edit the service (no Blueprint UI needed)**

1. [dashboard.render.com](https://dashboard.render.com) → open **venueflow-api** (not the Blueprint list).
2. **Settings** → scroll to **Build & Deploy**.
3. Replace **Build Command** with exactly:

```bash
npm install -g pnpm@10.12.1 && pnpm install --frozen-lockfile && pnpm --filter @venueflow/api exec prisma generate && pnpm --filter @venueflow/api run build
```

4. Replace **Start Command** with exactly:

```bash
cd apps/api && npx prisma migrate deploy && npx prisma db push --skip-generate && node dist/main.js
```

5. Click **Save Changes**.

**Way 2 — Blueprint sync (after you pushed Step 1)**

1. Render → left sidebar **Blueprints** (or **Blueprint**).
2. Open your VenueFlow blueprint → **Manual Sync** / **Sync Blueprint** / **Apply** (wording varies).
3. That re-reads `render.yaml` from GitHub and updates the service.

> Blueprint does **not** auto-redeploy every time you push code. It updates **settings** from `render.yaml`. You still deploy in step B.

#### B) Redeploy the API (this is what you want after GitHub changed)

1. Still on **venueflow-api** → top right **Manual Deploy**.
2. Choose **Deploy latest commit** (or **Clear build cache & deploy** if it failed again).
3. Open the **Logs** tab and wait until status is **Live** (green).

#### C) Environment variables (check once)

**venueflow-api** → **Environment**:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Neon connection string (from local `apps/api/.env`) |
| `JWT_ACCESS_SECRET` | Long random string (same one you use locally is OK) |
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `lax` |
| `WEB_ORIGIN` | Your Vercel URL (Step 3) — can fill after Vercel works |
| `CORS_ORIGIN` | Same as `WEB_ORIGIN` |
| `WEB_APP_URL` | Same as `WEB_ORIGIN` |

#### D) Test API

Browser: `https://venueflow-api-1a7o.onrender.com/api/v1/health`  
You should see JSON with `"status":"ok"`.

---

### 3 — Fix Vercel website and redeploy

1. [vercel.com](https://vercel.com) → project **venueflow** → **Settings** → **General**.
2. **Root Directory** → **Edit** → type **`apps/web`** → **Save**.  
   (If this stays empty, you get **“No Next.js version detected”** — that is your current error.)
3. **Environment Variables** (Production + Preview):

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |
| `API_PROXY_TARGET` | `https://venueflow-api-1a7o.onrender.com` (no trailing `/`) |

4. **Deployments** → latest failed deploy → **⋯** → **Redeploy** (or push a commit — Vercel auto-builds on push).

Wait until the deployment is **Ready** (green).

---

### 4 — Connect Vercel ↔ Render (after both are green)

1. Copy your live **Vercel** URL (e.g. `https://venueflow-xxx.vercel.app`).
2. Render → **venueflow-api** → **Environment** → set:

| Key | Value |
|-----|--------|
| `WEB_ORIGIN` | `https://your-vercel-url.vercel.app` |
| `CORS_ORIGIN` | same |
| `WEB_APP_URL` | same |

3. **Manual Deploy** → **Deploy latest commit** on Render again.

On Vercel: if you changed env vars, **Redeploy** once more.

---

### 5 — Use the app

1. Open your **Vercel** URL.
2. **Register** a new account (or log in if you seeded Neon).
3. First request after idle on free Render can take ~30s — refresh once.

---

## Render: Blueprint vs redeploy (short)

| You want… | What to click |
|-----------|----------------|
| New **code** from GitHub on the server | **venueflow-api** → **Manual Deploy** → **Deploy latest commit** |
| New **settings** from `render.yaml` (build/start commands) | **Blueprints** → your blueprint → **Sync / Apply**, then **Manual Deploy** |
| Build still shows `corepack enable` in logs | Build command not updated — do **Step 2A Way 1** (paste commands manually) |

Auto-deploy: if **venueflow-api** → **Settings** → **Auto-Deploy** is **Yes**, every `git push` to `main` triggers a deploy automatically (after Step 1).

---

## What failed before (so you know)

| Host | Error | Fix |
|------|--------|-----|
| Render | `EROFS` / `unlink '/usr/bin/pnpm'` | Remove `corepack enable`; use `npm install -g pnpm@10.12.1` |
| Vercel | `No Next.js version detected` | **Root Directory** = `apps/web` |
| Vercel (old) | API + web build together | Only deploy `apps/web` on Vercel |

---

## Local dev (your PC)

| File | Purpose |
|------|---------|
| `apps/api/.env` | Neon + secrets — **never commit** |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` |

```powershell
pnpm dev
```

---

## Stuck?

| Problem | Fix |
|---------|-----|
| Render log still says `corepack` | Paste build command from **Step 2A** in Render Settings |
| Vercel Next.js error | **Root Directory** = `apps/web`, redeploy |
| Login fails on Vercel | `API_PROXY_TARGET` = Render URL, no `/` at end; redeploy Vercel |
| Health 404 | API not Live yet; URL must end with `/api/v1/health` |
| Blueprint won’t sync | Use **Step 2A Way 1** (manual commands) — same result |

More detail: [DEPLOYMENT.md](./DEPLOYMENT.md)
