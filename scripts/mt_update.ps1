# scripts/mt_update.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Ensure-Dir($p) { New-Item -ItemType Directory -Force $p | Out-Null }

Write-Host "=== [MT] UPDATE: pull import_MT -> sync public -> build search ==="

# 1) pull import_MT
if (-not (Test-Path ".\import_MT\.git")) { throw "import_MT is not a git repo." }

Push-Location ".\import_MT"
git pull origin main
if ($LASTEXITCODE -ne 0) { throw "import_MT git pull failed." }
Pop-Location

# 2) ensure public folders
Ensure-Dir ".\public\data\theme"
Ensure-Dir ".\public\data\ssot"
Ensure-Dir ".\public\data\search"

# 3) sync theme + index
Get-ChildItem ".\import_MT\data\theme\T_*.json" -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item $_.FullName (Join-Path ".\public\data\theme" $_.Name) -Force
}
Copy-Item ".\import_MT\data\theme\index.json" ".\public\data\theme\index.json" -Force

# 4) sync ssot
if (Test-Path ".\import_MT\data\ssot") {
  Get-ChildItem ".\import_MT\data\ssot\*.csv" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName (Join-Path ".\public\data\ssot" $_.Name) -Force
  }
}

# 5) build search (moneytree-web only)
npm run build:search
if ($LASTEXITCODE -ne 0) { throw "build:search failed." }

# 보호: 결과가 data/search로 떨어지면 public로 복사
if (Test-Path ".\data\search\search_index.json") {
  Copy-Item ".\data\search\search_index.json" ".\public\data\search\search_index.json" -Force
}

Write-Host "=== [MT] UPDATE DONE ==="