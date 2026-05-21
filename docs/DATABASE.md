# PostgreSQL setup

## Option A — Docker (recommended)

```powershell
docker compose up -d
```

## Option B — Local PostgreSQL (Windows)

You already have **PostgreSQL 17** if the service `postgresql-x64-17` is running.

### Which password is which?

| Login | Used for | Where it lives |
|-------|----------|----------------|
| **postgres** | One-time setup (superuser) | Password you chose **during PostgreSQL install** |
| **GoSpots** | GoSpots app every day | Fixed in `.env`: `GoSpots` / `gospots_dev` |

The API error `P1000` means the **GoSpots** role does not exist yet (or password mismatch). Fix with the script below — you only need the **postgres** password once.

### Automated setup (recommended)

```powershell
cd d:\Programing\Projects\Web-Development\Gaming-SaaS
.\scripts\setup-gospots-db.ps1
```

### Manual setup (pgAdmin)

1. Open **pgAdmin 4** (installed with PostgreSQL).
2. Connect to **localhost** as user **postgres** (install password).
3. Query Tool → run `scripts/setup-gospots-db.sql`.

### Forgot postgres password?

Reset via pgAdmin, or see [PostgreSQL Windows docs](https://www.postgresql.org/docs/current/auth-methods.html). Common default install user: **postgres**, port **5432**.

### Confirm API is up

```powershell
# Should return JSON like {"status":"ok",...}
Invoke-RestMethod http://localhost:4000/api/v1/health
```

Or open in browser: http://localhost:4000/api/v1/health

Only after that works, register at http://localhost:3000/register

## Migrate & seed

```powershell
cd apps/api
# .env already points to:
# DATABASE_URL="postgresql://gospots:gospots_dev@localhost:5432/GoSpots?schema=public"

pnpm exec prisma migrate dev --name venue_staff_accounts
pnpm run seed
```

Super admin after seed: `admin@gospots.local` / `ChangeMe123!`

## Staff login format

Employees are **not** registered publicly. Owner creates them in **Dashboard → Staff**.

Login ID: `username@your-venue-slug.gospots`  
Example: `anna@cue-cobra.gospots`

## Seat limits (non-owner employees)

| Plan     | Max staff |
|----------|-----------|
| STARTER  | 2         |
| STANDARD | 5         |
| PRO      | 20        |
| ENTERPRISE | 999     |
