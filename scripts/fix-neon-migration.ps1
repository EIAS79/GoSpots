# Fixes Prisma P3009 / "type already exists" on Neon when schema was synced via db push.
# Requires apps/api/.env DATABASE_URL pointing at Neon.

$ErrorActionPreference = "Stop"
$apiDir = Join-Path $PSScriptRoot "..\apps\api"
Push-Location $apiDir

Write-Host "Neon migration repair (apps/api/.env)" -ForegroundColor Cyan

$stuck = "20260519120000_dashboard_menu_analytics"
Write-Host "`nMark stuck migration as applied: $stuck" -ForegroundColor Yellow
pnpm exec prisma migrate resolve --applied $stuck
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }

$pending = @(
  "20260519130000_play_sessions_reservation_billing",
  "20260519140000_shop_dashboard_key",
  "20260519150000_menu_item_daily_stock",
  "20260519180000_menu_sections_timing_images",
  "20260519200000_schedule_exceptions",
  "20260519210000_shop_orders",
  "20260519220000_shop_order_archive_guests",
  "20260520120000_shop_profile_gallery",
  "20260520140000_seating_table_groups",
  "20260520150000_seating_zone",
  "20260520160000_shop_floors_seating_floor",
  "20260520180000_stored_images",
  "20260521120000_seating_event_schedule",
  "20260521140000_shop_order_table_reservation",
  "20260521180000_reservation_staff_alert"
)

foreach ($m in $pending) {
  pnpm exec prisma migrate resolve --applied $m 2>$null | Out-Null
}

pnpm exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }

Write-Host "`nSUCCESS — all migrations in sync. Redeploy Render now." -ForegroundColor Green
Pop-Location
