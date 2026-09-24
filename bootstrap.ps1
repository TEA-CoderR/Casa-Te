param(
  [string]$ProjectName = "CASA_TE_App"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating latest Expo project..." -ForegroundColor Green
npx create-expo-app@latest $ProjectName

Set-Location $ProjectName

Write-Host "Installing project dependencies..." -ForegroundColor Green
npm install zustand @react-native-async-storage/async-storage

Write-Host ""
Write-Host "Project created. Now copy the contents of the starter kit's src/, assets/logo.png, AGENTS.md and CODEX_TASKS.md into this project." -ForegroundColor Yellow
Write-Host ""
Write-Host "Then run:" -ForegroundColor Green
Write-Host "  npx expo start"
