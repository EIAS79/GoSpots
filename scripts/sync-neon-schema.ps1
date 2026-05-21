# One-time: align Neon with prisma/schema.prisma (fixes missing accountType, enums, etc.)
$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "..\apps\api")
Write-Host "Syncing schema to Neon (apps/api/.env DATABASE_URL)..." -ForegroundColor Cyan
pnpm exec prisma db push --accept-data-loss
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Write-Host "Done. Try register again; redeploy Render if needed." -ForegroundColor Green
Pop-Location
