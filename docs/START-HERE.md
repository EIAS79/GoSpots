# GoSpots — production

```
Neon (DB)  ◄──  Render (API)  ◄──  Vercel (site + /api/v1 proxy)
```

| Piece | What you set |
|-------|----------------|
| GitHub | Your repo (e.g. `EIAS79/VenueFlow` or renamed) |
| API (Render) | **GoSpots** service URL from Render dashboard |
| Website (Vercel) | **GoSpots** project URL from Vercel → Domains |
| API health | `https://YOUR-RENDER-URL/api/v1/health` |
| Proxy health | `https://YOUR-VERCEL-URL/api/v1/health` → same JSON |

**API is the same** — still `/api/v1/auth/register`, `/api/v1/auth/login`, etc. Only names and host URLs changed.

---

## Environment variables (names unchanged)

### Vercel → **GoSpots** project

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |
| `API_PROXY_TARGET` | Your **Render** URL, no trailing `/` |

**Root Directory:** `apps/web` → **Redeploy** after any change.

### Render → **gospots-api** (or your service name)

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Neon connection string |
| `JWT_ACCESS_SECRET` | Your secret |
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `lax` |
| `WEB_ORIGIN` | Your **Vercel** URL |
| `CORS_ORIGIN` | Same as `WEB_ORIGIN` |
| `WEB_APP_URL` | Same as `WEB_ORIGIN` |

**Manual Deploy** on Render after changing `WEB_*` / `CORS_*`.

---

## Quick test

1. `YOUR-RENDER-URL/api/v1/health` → `{"status":"ok",...}`
2. `YOUR-VERCEL-URL/api/v1/health` → same (proxy works)
3. Register / login on Vercel URL
4. Staff: `user@venue-slug.gospots` (old `@…venueflow` still works)

---

## Push code

```powershell
cd "D:\Programing\Projects\Web-Development\Gaming-SaaS"
git add .
git commit -m "your message"
git push origin main
```

Vercel + Render auto-deploy if connected to `main`.

---

## Local dev

```powershell
pnpm dev
```

`apps/api/.env` + `apps/web/.env.local` — `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`

---

## Broken?

| Symptom | Fix |
|---------|-----|
| **404** on register/login | Vercel: `API_PROXY_TARGET` = Render URL → **Redeploy** |
| Login fails | Render `WEB_ORIGIN` = exact Vercel URL → redeploy Render |
| Slow first hit | Render free tier cold start (~30s) |

More detail: [DEPLOYMENT.md](./DEPLOYMENT.md)
