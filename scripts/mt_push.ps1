# scripts/mt_push.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== [MT] PUSH: commit & push public/data ==="

git add public/data

# 변경이 없으면 커밋 스킵
$diff = git diff --cached --name-only
if (-not $diff) {
  Write-Host "No changes in public/data. Skip commit/push."
  exit 0
}

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git commit -m "MT sync: public data ($ts)"
git push origin main

Write-Host "=== [MT] PUSH DONE ==="