# GoSpots — production (you’re live)

```
Neon (DB)  ◄──  Render (API)  ◄──  Vercel (site + /api/v1 proxy)
```

| Piece | URL / name |
|-------|------------|
| GitHub | [EIAS79/VenueFlow](https://github.com/EIAS79/VenueFlow) (repo name; product is **GoSpots**) |
| API (Render) | `https://venueflow-api-1a7o.onrender.com` |
| Website (Vercel) | Your project URL (e.g. `https://venueflow-*.vercel.app`) |
| API health | `https://venueflow-api-1a7o.onrender.com/api/v1/health` |
| Proxy health (via Vercel) | `https://YOUR-VERCEL-URL/api/v1/health` → must return same JSON |

---

## Environment variables (keep these set)

### Vercel → project **venueflow** (or renamed)

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |
| `API_PROXY_TARGET` | `https://venueflow-api-1a7o.onrender.com` |

**Root Directory:** `apps/web`

After any change → **Deployments** → **Redeploy**.

### Render → **venueflow-api** (service name; product is GoSpots)

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Neon connection string |
| `JWT_ACCESS_SECRET` | Your secret (same as local `apps/api/.env` is fine) |
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `lax` |
| `WEB_ORIGIN` | Your **Vercel** URL (no trailing `/`) |
| `CORS_ORIGIN` | Same as `WEB_ORIGIN` |
| `WEB_APP_URL` | Same as `WEB_ORIGIN` |

After changing `WEB_*` / `CORS_*` → **Manual Deploy**.

---

## Use the app

1. Open your **Vercel** URL.
2. **Register** (new venue) or **Login**.
3. **Staff logins:** `username@your-venue-slug.gospots` (old `@…venueflow` accounts still work).
4. Free Render sleeps when idle — first click after ~15 min can take **30s**; refresh once.

---

## When you change code

```powershell
cd "D:\Programing\Projects\Web-Development\Gaming-SaaS"
git add .
git status   # apps/api/.env must NOT appear
git commit -m "your message"
git push origin main
```

- **Vercel:** auto-deploys on push (if connected to `main`).
- **Render:** auto-deploys if enabled; else **Manual Deploy** → **Deploy latest commit**.

---

## Local dev

| File | Purpose |
|------|---------|
| `apps/api/.env` | Neon + secrets — **never commit** |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` |

```powershell
pnpm dev
```

---

## Something broken?

| Symptom | Fix |
|---------|-----|
| Register/login **404** | Vercel: both env vars above set → **Redeploy**. Test `YOUR-VERCEL-URL/api/v1/health`. |
| Login works once then fails | Render `WEB_ORIGIN` / `CORS_ORIGIN` = exact Vercel URL → redeploy Render. |
| API health 404 on Render | Wait until deploy is **Live**; URL must be `/api/v1/health`. |
| Slow first load | Normal on Render free tier. |
| Images broken | API must be up; with proxy, images load from Vercel domain. |

First-time deploy / architecture detail: [DEPLOYMENT.md](./DEPLOYMENT.md)
