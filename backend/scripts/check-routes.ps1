# Calls the running RouteView backend with Faridabad -> Gurugram and checks the answer.
# Usage (backend must be running):  powershell -File backend\scripts\check-routes.ps1 [-BaseUrl http://localhost:8080]
param([string]$BaseUrl = "http://localhost:8080")

$body = @{
  origin      = @{ latitude = 28.4089; longitude = 77.3178 }   # Faridabad, Haryana
  destination = @{ latitude = 28.4595; longitude = 77.0266 }   # Gurugram
} | ConvertTo-Json -Depth 4

try {
  $r = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/routes" -ContentType "application/json" -Body $body
} catch {
  $resp = $_.Exception.Response
  $status = if ($resp) { [int]$resp.StatusCode } else { 0 }
  Write-Host "FAIL  HTTP $status"
  if ($resp) { $reader = New-Object IO.StreamReader($resp.GetResponseStream()); Write-Host $reader.ReadToEnd() }
  switch ($status) {
    0   { Write-Host "Backend not reachable: is it running on $BaseUrl ?" }
    503 { Write-Host "ROUTING_NOT_CONFIGURED / ROUTING_UNAVAILABLE / ROUTING_QUOTA: see the backend log line 'Route calculation failed: reason=...'. NOT_CONFIGURED = GOOGLE_MAPS_SERVER_API_KEY not read (start the backend from the backend folder, or set it as an environment variable)." }
    502 { Write-Host "ROUTING_REJECTED / INVALID_RESPONSE: Google answered with an error (key restriction, Routes API not enabled, billing)." }
    504 { Write-Host "ROUTING_TIMEOUT: Google did not answer in time." }
  }
  exit 1
}

$n = @($r.routes).Count
Write-Host "Routes returned: $n"
$i = 0
foreach ($route in $r.routes) {
  $i++
  $km = [math]::Round($route.distanceMeters / 1000, 1)
  $min = [math]::Round($route.durationSeconds / 60)
  $areas = ($route.detectedAreas | ForEach-Object { $_.name }) -join " > "
  Write-Host ("Route {0}: {1} km, {2} min, via '{3}', polyline {4} chars, {5} areas" -f $i, $km, $min, $route.summary, $route.encodedPolyline.Length, @($route.detectedAreas).Count)
  if ($areas) { Write-Host "         $areas" }
}
$distinct = ($r.routes | ForEach-Object { $_.encodedPolyline } | Sort-Object -Unique).Count
Write-Host ("Distinct paths: {0}" -f $distinct)
if ($n -ge 1 -and $distinct -eq $n) { Write-Host "OK" } else { Write-Host "CHECK: expected several different alternatives" }
