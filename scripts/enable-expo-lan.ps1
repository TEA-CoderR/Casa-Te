param([switch]$Restore)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupPath = Join-Path $projectRoot '.tools\expo-firewall-backup.json'
$ruleName = 'CASA-TE-Expo-LAN-8081'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator rights are required to adjust the Windows firewall.'
}
if ($Restore) {
  if (!(Test-Path -LiteralPath $backupPath)) { throw 'No saved firewall state found.' }
  $backup = Get-Content -LiteralPath $backupPath -Raw | ConvertFrom-Json
  foreach ($name in $backup.disabledRules) { Enable-NetFirewallRule -Name $name | Out-Null }
  Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Output 'Original firewall rules restored.'
  exit 0
}
$nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodePath = (Resolve-Path -LiteralPath $nodePath).Path
$blockedRules = @(Get-NetFirewallRule -Enabled True -Direction Inbound -Action Block | Where-Object {
  $application = $_ | Get-NetFirewallApplicationFilter
  $port = $_ | Get-NetFirewallPortFilter
  $application.Program -ieq $nodePath -and [string]$_.Profile -eq 'Public' -and [string]$port.Protocol -eq 'TCP'
})
if (!(Test-Path -LiteralPath $backupPath)) {
  @{ program = $nodePath; disabledRules = @($blockedRules | ForEach-Object Name) } |
    ConvertTo-Json | Set-Content -LiteralPath $backupPath -Encoding utf8
}
if (!(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name $ruleName -DisplayName 'CASA & TE Expo - local subnet TCP 8081' `
    -Direction Inbound -Action Allow -Program $nodePath -Protocol TCP -LocalPort 8081 `
    -RemoteAddress LocalSubnet -Profile Public,Private | Out-Null
}
foreach ($rule in $blockedRules) { Disable-NetFirewallRule -Name $rule.Name | Out-Null }
Get-NetFirewallRule -Name $ruleName | Select-Object DisplayName,Enabled,Action,Profile | Format-List
