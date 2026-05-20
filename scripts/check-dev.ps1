# Quick dev environment check (run from repo root: pnpm check:dev)

$ok = $true
Write-Host "`nVenueFlow dev check`n" -ForegroundColor Cyan

# Postgres port
$pg = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue
if ($pg.TcpTestSucceeded) {
  Write-Host "[OK] PostgreSQL port 5432 is open" -ForegroundColor Green
} else {
  Write-Host "[FAIL] Nothing on port 5432 — start PostgreSQL service" -ForegroundColor Red
  $ok = $false
}

# venueflow user
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
if (Test-Path $psql) {
  $env:PGPASSWORD = "venueflow_dev"
  $r = & $psql -U venueflow -h 127.0.0.1 -d venueflow -tAc "SELECT 1" 2>&1
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Database user venueflow connects" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] venueflow user missing or wrong password — run: pnpm db:setup" -ForegroundColor Red
    $ok = $false
  }
}

# API
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/v1/health" -TimeoutSec 3
  Write-Host "[OK] API health: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
  Write-Host "[FAIL] API not responding on :4000 — DB error? Restart after pnpm db:setup" -ForegroundColor Red
  $ok = $false
}

if (-not $ok) {
  Write-Host "`nFix: `$env:POSTGRES_PASSWORD = 'your_postgres_install_password'; pnpm db:setup`n" -ForegroundColor Yellow
  exit 1
}
Write-Host "`nAll good — you can register.`n" -ForegroundColor Green
