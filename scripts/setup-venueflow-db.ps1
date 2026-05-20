# Creates venueflow DB user + database, runs Prisma migrations.
#
# From repo root (interactive):
#   pnpm db:setup
#
# Non-interactive (replace with YOUR postgres install password):
#   $env:POSTGRES_PASSWORD = "your_postgres_password"
#   pnpm db:setup

param(
  [string]$PostgresPassword = $env:POSTGRES_PASSWORD
)

$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
if (-not (Test-Path $psql)) {
  $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $psql = $found.FullName } else { throw "psql not found. Install PostgreSQL 17." }
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$pgHost = "127.0.0.1"

Write-Host ""
Write-Host "VenueFlow database setup" -ForegroundColor Cyan
Write-Host "Uses PostgreSQL superuser: postgres (password from install)"
Write-Host ""

if (-not $PostgresPassword) {
  $secure = Read-Host "postgres password" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $PostgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

$env:PGPASSWORD = $PostgresPassword

Write-Host "Testing postgres login..." -ForegroundColor Yellow
$test = & $psql -U postgres -h $pgHost -p 5432 -tAc "SELECT 1" 2>&1
if ($LASTEXITCODE -ne 0) {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Write-Host $test
  throw "Cannot connect as postgres. Wrong password? Set: `$env:POSTGRES_PASSWORD = 'your_password'"
}

Write-Host "Creating venueflow role..." -ForegroundColor Yellow
$createRole = "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'venueflow') THEN CREATE ROLE venueflow WITH LOGIN PASSWORD 'venueflow_dev'; ELSE ALTER ROLE venueflow WITH LOGIN PASSWORD 'venueflow_dev'; END IF; END `$`$;"
& $psql -U postgres -h $pgHost -p 5432 -c $createRole 2>&1 | Out-Host

$dbExists = & $psql -U postgres -h $pgHost -p 5432 -tAc "SELECT 1 FROM pg_database WHERE datname='venueflow'" 2>$null
if ($LASTEXITCODE -ne 0 -or "$dbExists".Trim() -ne "1") {
  Write-Host "Creating venueflow database..." -ForegroundColor Yellow
  & $psql -U postgres -h $pgHost -p 5432 -c "CREATE DATABASE venueflow OWNER venueflow;" 2>&1 | Out-Host
}

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Host "Verifying venueflow login..." -ForegroundColor Yellow
$env:PGPASSWORD = "venueflow_dev"
$vf = & $psql -U venueflow -h $pgHost -d venueflow -tAc "SELECT 1" 2>&1
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
  Write-Host $vf
  throw "venueflow user still cannot connect."
}

Write-Host "Running Prisma migrations..." -ForegroundColor Yellow
Push-Location (Join-Path $repoRoot "apps\api")
pnpm exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
  Write-Host "migrate deploy skipped (baseline DB) — applying pending-patches.sql..." -ForegroundColor Yellow
  pnpm exec prisma db execute --schema prisma/schema.prisma --file prisma/pending-patches.sql
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "pending-patches.sql failed" }
}
pnpm exec prisma generate
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "prisma generate failed" }
pnpm run seed
Pop-Location

Write-Host ""
Write-Host "SUCCESS" -ForegroundColor Green
Write-Host "1. Stop pnpm dev (Ctrl+C) and run: pnpm dev"
Write-Host "2. Open: http://localhost:4000/api/v1/health"
Write-Host "3. Register at: http://localhost:3000/register"
Write-Host ""
