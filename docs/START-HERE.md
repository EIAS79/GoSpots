# Start here — deploy VenueFlow (simple checklist)

You only touch **3 websites**. Your code already has Neon wired in `apps/api/.env` (local file, not on GitHub).

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Neon      │◄────│   Render    │◄────│   Vercel    │
│  (database) │     │  (API :4000)│     │  (website)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           ▲                    │
                           └──── proxy ─────────┘
```

---

## Where you are now

| Step | Status |
|------|--------|
| Neon database + migrations | ✅ Done (if you followed earlier setup) |
| Code on GitHub | ⬜ You do this next |
| API on Render | ⬜ |
| Website on Vercel | ⬜ |

---

## Step 1 — Push code to GitHub (10 min)

1. Create a **private** repo on [github.com/new](https://github.com/new).
2. In your project folder (PowerShell):

```powershell
cd "D:\Programing\Projects\Web-Development\Gaming-SaaS"
git add .
git status
```

**Check:** `apps/api/.env` must **NOT** appear in `git status`. If it does, stop — it should stay local only.

```powershell
git commit -m "Prepare VenueFlow for production preview"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

(Use `master` instead of `main` if that is your branch name.)

---

## Step 2 — Render = your API (15 min)

1. Go to [dashboard.render.com](https://dashboard.render.com) → sign in with GitHub.
2. **New +** → **Blueprint** → connect the repo you just pushed.
3. Render reads `render.yaml` and creates **venueflow-api**. Click deploy.

### Environment variables (Render → venueflow-api → **Environment**)

Click **Add Environment Variable** for each row:

| Key | What to paste |
|-----|----------------|
| `DATABASE_URL` | Open `apps/api/.env` on your PC → copy the whole `DATABASE_URL="..."` value (Neon string). |
| `JWT_ACCESS_SECRET` | Any long random text (e.g. 40+ characters). Example: run in PowerShell: `-join ((48..122) \| Get-Random -Count 40 \| % {[char]$_})` |
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `lax` |
| `WEB_ORIGIN` | Leave empty for now — fill after Step 3 |
| `CORS_ORIGIN` | Same as `WEB_ORIGIN` |
| `WEB_APP_URL` | Same as `WEB_ORIGIN` |

4. Wait until deploy is **Live** (green).
5. Copy your API URL from the top of the page, e.g. `https://venueflow-api-xxxx.onrender.com`.
6. Test in browser: `https://YOUR-RENDER-URL.onrender.com/api/v1/health`  
   You should see JSON like `"status":"ok"`.

---

## Step 3 — Vercel = your website (10 min)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub.
2. **Add New…** → **Project** → import the **same** repo.
3. **Important:** set **Root Directory** to `apps/web` (not the repo root).
4. **Environment Variables** (before deploy):

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |
| `API_PROXY_TARGET` | Your Render URL from Step 2 — **no** `/` at the end. Example: `https://venueflow-api-xxxx.onrender.com` |

5. Click **Deploy**. Wait for it to finish.
6. Copy your Vercel URL, e.g. `https://gaming-saas-abc123.vercel.app`.

---

## Step 4 — Connect Vercel ↔ Render (5 min)

Render needs to know your Vercel URL:

1. Render → **venueflow-api** → **Environment**.
2. Set (replace with your real Vercel URL):

| Key | Value |
|-----|--------|
| `WEB_ORIGIN` | `https://your-app.vercel.app` |
| `CORS_ORIGIN` | `https://your-app.vercel.app` |
| `WEB_APP_URL` | `https://your-app.vercel.app` |

3. **Manual Deploy** → **Deploy latest commit** on Render.

On Vercel: if you changed env vars, **Deployments** → ⋯ → **Redeploy**.

---

## Step 5 — Try it

1. Open your **Vercel** URL.
2. Register a new venue owner account (or use seed admin only works on Neon if you ran seed — for a fresh register, use Register on the site).
3. If login fails: wait 30s (Render free tier wakes up) and refresh.

---

## What you do NOT need to change in code

- No edits in `apps/api/.env` for Vercel — Vercel uses the two variables in the table above only.
- Neon string stays in **Render** `DATABASE_URL` and local `apps/api/.env` for dev.

---

## Local dev (when you code on your PC)

| File | Purpose |
|------|---------|
| `apps/api/.env` | Neon or local Postgres + secrets |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` |

Run: `pnpm dev` from repo root.

---

## Stuck?

| Problem | Fix |
|---------|-----|
| `git status` shows `.env` | Do not commit. Run `git reset apps/api/.env` |
| Render build fails | Render → **Logs** tab. Usually missing `DATABASE_URL`. |
| Vercel build fails | Root Directory must be `apps/web`. |
| Login fails on Vercel | Check `API_PROXY_TARGET` matches Render URL exactly. Redeploy both. |
| Health URL 404 | Wait for Render deploy; path must be `/api/v1/health` |

More detail: [DEPLOYMENT.md](./DEPLOYMENT.md)
