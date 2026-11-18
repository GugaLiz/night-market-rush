$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entryPath = Join-Path $PSScriptRoot 'serve.mjs'
$pidPath = Join-Path $projectRoot '.night-market-server.json'
if (!(Test-Path -LiteralPath $pidPath)) { Write-Output 'No managed server metadata found. No process was stopped.'; exit 0 }
try { $metadata = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json } catch { throw 'Unreadable metadata. No process was stopped.' }
if ($metadata.service -ne 'night-market-rush-static-v1' -or $metadata.projectRoot -ine $projectRoot -or $metadata.entryPath -ine $entryPath) { throw 'Metadata does not belong to this project. No process was stopped.' }
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$metadata.pid)" -ErrorAction SilentlyContinue
if (!$processInfo) { Remove-Item -LiteralPath $pidPath; Write-Output 'The managed process already exited; stale metadata removed.'; exit 0 }
if (!$processInfo.ExecutablePath -or !$processInfo.CommandLine -or [IO.Path]::GetFileName($processInfo.ExecutablePath) -ine 'node.exe') { throw 'Saved PID is not a verifiable Node server. No process was stopped.' }
$exe = [regex]::Escape($processInfo.ExecutablePath)
$script = [regex]::Escape($entryPath)
$pattern = '^(?:"' + $exe + '"|' + $exe + ')\s+(?:"' + $script + '"|' + $script + ')(?:\s|$)'
if ($processInfo.CommandLine -inotmatch $pattern) { throw 'Saved PID now belongs to a different command. No process was stopped.' }
Stop-Process -Id ([int]$metadata.pid) -ErrorAction Stop
if (Test-Path -LiteralPath $pidPath) {
    $latest = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
    if ($latest.pid -eq $metadata.pid -and $latest.instance -eq $metadata.instance) { Remove-Item -LiteralPath $pidPath }
}
Write-Output "Stopped Night Market Rush server PID $($metadata.pid)."
