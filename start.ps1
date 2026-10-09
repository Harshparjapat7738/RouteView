# Starts the full stack (db + backend + frontend) in Docker and prints the URLs to use,
# including the one reachable from a phone on the same Wi-Fi.
#
#   powershell -File start.ps1

docker compose -f docker-compose.full.yml up -d

$lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notlike '*WSL*' -and
        $_.InterfaceAlias -notlike '*vEthernet*' -and
        $_.InterfaceAlias -notlike '*Loopback*'
    } |
    Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "RouteView is running:" -ForegroundColor Green
Write-Host "  Local (this PC):     http://localhost:5173"
if ($lanIp) {
    Write-Host "  Network (phone):     http://${lanIp}:5173" -ForegroundColor Cyan
    Write-Host "  (phone must be on the same Wi-Fi network)"
} else {
    Write-Host "  Network (phone):     could not detect a LAN IP - run 'ipconfig' and use your Wi-Fi adapter's IPv4 address"
}
Write-Host ""
Write-Host "Backend health:        http://localhost:8080/actuator/health"
Write-Host ""
