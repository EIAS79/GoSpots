# Stops dev servers on GoSpots ports (3000 = Next, 4000 = Nest)
$ports = 3000, 4000

foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $processIds) {
    if ($processId -gt 0) {
      $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
      $name = if ($proc) { $proc.ProcessName } else { "unknown" }
      Write-Host "Stopping PID $processId ($name on port $port)"
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

Start-Sleep -Milliseconds 500

foreach ($port in $ports) {
  $stillListening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($stillListening) {
    Write-Warning "Port $port is still in use. Close other dev servers before running npm run dev again."
    exit 1
  }
}

Write-Host "Ports 3000 and 4000 are free. Start only one npm run dev at a time."
