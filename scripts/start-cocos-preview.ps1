param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$Build,
    [ValidateRange(1024,65535)][int]$Port = 45590,
    [string]$NodePath = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entryPath = Join-Path $PSScriptRoot 'serve-cocos-preview.mjs'
$runtimePath = Join-Path $projectRoot '.runtime'
$pidPath = Join-Path $runtimePath 'cocos-preview.json'
$serviceId = 'night-market-rush-cocos-preview-v1'
$healthUrl = "http://127.0.0.1:$Port/__night_market_health"
if (!(Test-Path -LiteralPath (Join-Path $projectRoot "cocos/build/$Build/index.html") -PathType Leaf)) { throw 'Creator build index.html not found.' }
if (Test-Path -LiteralPath (Join-Path $projectRoot "cocos/build/$Build/candidate-build.json") -PathType Leaf) { throw 'Storage-enabled candidates are restricted to isolated test profiles and cannot use the ordinary preview service.' }
if (!$NodePath) {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $NodePath = $command.Source }
    else { $NodePath = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
}
if (!(Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node.js not found; supply -NodePath.' }
$NodePath = [IO.Path]::GetFullPath($NodePath)
function Test-OwnedProcess([int]$ProcessId) {
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (!$info -or !$info.ExecutablePath -or !$info.CommandLine) { return $false }
    $exe = [regex]::Escape($info.ExecutablePath); $script = [regex]::Escape($entryPath)
    $pattern = '^(?:"' + $exe + '"|' + $exe + ')\s+(?:"' + $script + '"|' + $script + ')(?:\s|$)'
    return (($info.ExecutablePath -ieq $NodePath) -and ($info.CommandLine -imatch $pattern))
}
function Read-Health { try { return Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 } catch { return $null } }
if (Test-Path -LiteralPath $pidPath) {
    try { $meta = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json } catch { throw 'Unreadable Cocos preview metadata; no process was stopped.' }
    if ($meta.service -ne $serviceId -or $meta.projectRoot -ine $projectRoot -or $meta.entryPath -ine $entryPath) { throw 'Preview metadata does not identify this project; no process was stopped.' }
    if (Get-Process -Id ([int]$meta.pid) -ErrorAction SilentlyContinue) {
        if (!(Test-OwnedProcess ([int]$meta.pid))) { throw 'Preview PID belongs to a different process; no process was stopped.' }
        if ([int]$meta.port -ne $Port -or $meta.build -ne $Build) { throw "A Cocos preview is already managed on port $($meta.port) for $($meta.build). Stop it first." }
        $health = Read-Health
        if ($health -and $health.service -eq $serviceId -and [int]$health.pid -eq [int]$meta.pid -and $health.instance -eq $meta.instance) {
            Write-Output "Cocos DEVELOPMENT PROTOTYPE already running: http://127.0.0.1:$Port/cocos-preview/"; exit 0
        }
        throw 'The managed preview is not healthy; no process was stopped.'
    }
    # Remove only the stale metadata after verifying its identity and absent PID.
    Remove-Item -LiteralPath $pidPath
}
$health = Read-Health
if ($health) { throw "Port $Port is already in use; no process was stopped." }
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
$stdoutPath = Join-Path $runtimePath 'cocos-preview.stdout.log'
$stderrPath = Join-Path $runtimePath 'cocos-preview.stderr.log'
$arguments = '"' + $entryPath + '" --build ' + $Build + ' --port ' + $Port
$process = Start-Process -FilePath $NodePath -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    $process.Refresh()
    if ($process.HasExited) { $details = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue; throw "Cocos preview exited during startup. $details" }
    $health = Read-Health
    if ($health -and $health.service -eq $serviceId -and [int]$health.pid -eq $process.Id) {
        Write-Output "Cocos DEVELOPMENT PROTOTYPE: http://127.0.0.1:$Port/cocos-preview/"
        Write-Output "Build: $Build; PID: $($process.Id)"; exit 0
    }
}
throw 'Cocos preview health check timed out; no unrelated process was stopped. Inspect .runtime logs.'
