param([switch]$Web, [string]$LanAddress)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$demoNode = if ($nodeCommand) { $nodeCommand.Source } else {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (!(Test-Path -LiteralPath $demoNode)) { throw 'Install Node.js before starting the demo.' }
# npm workspaces may hoist expo to the repository root, so resolve the CLI through Node.
$expoCli = & $demoNode -e "try{console.log(require.resolve('expo/bin/cli'))}catch{}"
if (!$expoCli) { throw 'Install dependencies with npm ci (in the repository root) first.' }
if (!(Test-Path -LiteralPath '.env')) { Write-Warning 'Missing apps/mobile/.env - copy .env.example and add your Supabase URL and anon key.' }
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
Write-Host 'Use an Expo Go version matching the Expo SDK in package.json. Keep the phone and computer on the same Wi-Fi.'
if ($Web) { & $demoNode $expoCli start --web --go --lan --port 8081 }
else { & $demoNode $expoCli start --go --lan --port 8081 }
exit $LASTEXITCODE
