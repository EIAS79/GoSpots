# Stops dev servers on VenueFlow ports (3000 = Next, 4000 = Nest)
$ports = 3000, 4000

foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $processIds) {
    if ($processId -gt 0) {
      Write-Host "Stopping PID $processId (port $port)"
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

Start-Sleep -Milliseconds 500

foreach ($port in $ports) {
  $stillListening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($stillListening) {
    Write-Warning "Port $port is still in use."
    exit 1
  }
}

Write-Host "Ports 3000 and 4000 are free."
