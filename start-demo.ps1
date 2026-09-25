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
  $env:EXPO_PUBLIC_ORDER_API_URL = "http://${LanAddress}:8787"
  Write-Host "Phone address: exp://${LanAddress}:8081" -ForegroundColor Green
  Write-Host "Order service: http://${LanAddress}:8787" -ForegroundColor Green
}
$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adbPath = if ($adbCommand) { $adbCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
if (Test-Path -LiteralPath $adbPath) { & $adbPath reverse tcp:8787 tcp:8787 2>$null | Out-Null }
$expoVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).dependencies.expo
$expoMajor = [regex]::Match([string]$expoVersion, '\d+').Value
Write-Host "Use Expo Go supporting SDK $expoMajor. Keep the phone and computer on the same Wi-Fi."
if ($Web) { & $demoNode node_modules/expo/bin/cli start --web --go --lan --port 8081 }
else { & $demoNode node_modules/expo/bin/cli start --go --lan --port 8081 }
exit $LASTEXITCODE
