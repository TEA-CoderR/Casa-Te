param([int]$Port = 8787)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$demoNode = if ($nodeCommand) { $nodeCommand.Source } else {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (!(Test-Path -LiteralPath $demoNode)) { throw 'Install Node.js before starting the admin demo.' }
if (!(Test-Path -LiteralPath 'node_modules/tsx/dist/cli.mjs')) { throw 'Install dependencies with npm ci first.' }
$env:ORDER_DEMO_PORT = [string]$Port
& $demoNode node_modules/tsx/dist/cli.mjs server/index.ts
exit $LASTEXITCODE
