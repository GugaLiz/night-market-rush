$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entryPath = Join-Path $PSScriptRoot 'serve-cocos-preview.mjs'
$pidPath = Join-Path $projectRoot '.runtime/cocos-preview.json'
$serviceId = 'night-market-rush-cocos-preview-v1'
if (!(Test-Path -LiteralPath $pidPath)) { Write-Output 'No Cocos preview metadata found. No process was stopped.'; exit 0 }
try { $meta = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json } catch { throw 'Unreadable Cocos preview metadata; no process was stopped.' }
if ($meta.service -ne $serviceId -or $meta.projectRoot -ine $projectRoot -or $meta.entryPath -ine $entryPath) { throw 'Preview metadata does not identify this project; no process was stopped.' }
$info = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$meta.pid)" -ErrorAction SilentlyContinue
if (!$info) { Remove-Item -LiteralPath $pidPath; Write-Output 'The Cocos preview already exited; stale metadata removed.'; exit 0 }
if (!$info.ExecutablePath -or !$info.CommandLine -or [IO.Path]::GetFileName($info.ExecutablePath) -ine 'node.exe') { throw 'Preview PID is not a verifiable Node process; no process was stopped.' }
$exe = [regex]::Escape($info.ExecutablePath); $script = [regex]::Escape($entryPath)
$pattern = '^(?:"' + $exe + '"|' + $exe + ')\s+(?:"' + $script + '"|' + $script + ')(?:\s|$)'
if ($info.CommandLine -inotmatch $pattern) { throw 'Preview PID belongs to another command; no process was stopped.' }
try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$([int]$meta.port)/__night_market_health" -TimeoutSec 2 } catch { throw 'Cannot verify Cocos preview health; no process was stopped.' }
if ($health.service -ne $serviceId -or [int]$health.pid -ne [int]$meta.pid -or $health.instance -ne $meta.instance) { throw 'Preview health does not match metadata; no process was stopped.' }
Stop-Process -Id ([int]$meta.pid) -ErrorAction Stop
if (Test-Path -LiteralPath $pidPath) {
    $latest = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
    if ($latest.pid -eq $meta.pid -and $latest.instance -eq $meta.instance) { Remove-Item -LiteralPath $pidPath }
}
Write-Output "Stopped Cocos development preview PID $($meta.pid)."
