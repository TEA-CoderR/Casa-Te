param([switch]$Web, [string]$LanAddress)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$demoNode = if ($nodeCommand) { $nodeCommand.Source } else {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (!(Test-Path -LiteralPath $demoNode)) { throw 'Install Node.js before starting the demo.' }
if (!(Test-Path -LiteralPath 'node_modules/expo/bin/cli')) { throw 'Install dependencies with npm ci first.' }
if (!$LanAddress) {
  $network = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    Select-Object -First 1
  if ($network) { $LanAddress = $network.IPv4Address.IPAddress | Select-Object -First 1 }
}
if ($LanAddress) {
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanAddress
  Write-Host "Phone address: exp://${LanAddress}:8081" -ForegroundColor Green
}
Write-Host 'Use Expo Go supporting SDK 54. Keep the phone and computer on the same Wi-Fi.'
if ($Web) { & $demoNode node_modules/expo/bin/cli start --web --go --lan --port 8081 }
else { & $demoNode node_modules/expo/bin/cli start --go --lan --port 8081 }
exit $LASTEXITCODE
