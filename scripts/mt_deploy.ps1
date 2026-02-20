# scripts/mt_deploy.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = ".\logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$logFile = Join-Path $logDir ("mt_deploy_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log")

function Log($msg) {
  $line = ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg)
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

Log "=== MT DEPLOY START ==="

# 0) dev 서버(3000) 사용 중이면 종료 (파일 잠김 방지)
$port = 3000
$procId = $null

try {
  $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { $procId = $conn.OwningProcess }
} catch {}

if ($procId) {
  Log "Port $port in use. Stopping process PID=$procId"
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
} else {
  Log "Port $port not in use. No dev process to stop."
}

# 1) update (pull+sync+search)
Log "Running mt:update..."
powershell -ExecutionPolicy Bypass -File ".\scripts\mt_update.ps1"
Log "mt:update done."

# 2) push (commit+push public/data)
Log "Running mt:push..."
powershell -ExecutionPolicy Bypass -File ".\scripts\mt_push.ps1"
Log "mt:push done."

# 3) dev 서버 재시작(선택) - 원하면 활성화
# Log "Starting dev server..."
# Start-Process -FilePath "npm" -ArgumentList "run","dev" -WorkingDirectory $root

Log "=== MT DEPLOY DONE ==="
Log "Log file: $logFile"