param(
  [string]$RemoteUrl = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  git init
}

git add .
git commit -m "chore: initialize CASA & TE mobile app workflow"

git branch -M main

if ($RemoteUrl -ne "") {
  git remote add origin $RemoteUrl
  git push -u origin main
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Green
Write-Host "1. Create dev branch: git checkout -b dev"
Write-Host "2. Push it: git push -u origin dev"
Write-Host "3. Give Codex CODEX_FIRST_TASK.md"
