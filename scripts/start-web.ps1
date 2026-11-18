param([ValidateRange(1024,65535)][int]$Port = 4173)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entryPath = Join-Path $PSScriptRoot 'serve.mjs'
$pidPath = Join-Path $projectRoot '.night-market-server.json'
$serviceId = 'night-market-rush-static-v1'
$healthUrl = "http://127.0.0.1:$Port/__night_market_health"
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html') -PathType Leaf)) {
    throw 'dist/index.html does not exist. Run npm.cmd run build first.'
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

function Test-OwnedProcess([int]$ProcessId) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (!$processInfo -or !$processInfo.ExecutablePath -or !$processInfo.CommandLine) { return $false }
    $exe = [regex]::Escape($processInfo.ExecutablePath)
    $script = [regex]::Escape($entryPath)
    $pattern = '^(?:"' + $exe + '"|' + $exe + ')\s+(?:"' + $script + '"|' + $script + ')(?:\s|$)'
    return (($processInfo.ExecutablePath -ieq $nodePath) -and ($processInfo.CommandLine -imatch $pattern))
}

function Read-Health {
    try { return Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 } catch { return $null }
}

if (Test-Path -LiteralPath $pidPath) {
    try { $metadata = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json } catch { throw 'Server metadata is unreadable. Inspect .night-market-server.json before starting another process.' }
    if ($metadata.service -ne $serviceId -or $metadata.projectRoot -ine $projectRoot -or $metadata.entryPath -ine $entryPath) {
        throw 'Server metadata does not identify this project. No process was modified.'
    }
    $existing = Get-Process -Id $metadata.pid -ErrorAction SilentlyContinue
    if ($existing) {
        if (!(Test-OwnedProcess ([int]$metadata.pid))) { throw 'Saved PID belongs to a different command. No process was modified.' }
        if ([int]$metadata.port -ne $Port) { throw "This project already runs on port $($metadata.port). Use that address, or stop-web.ps1 before changing ports." }
        $health = Read-Health
        if ($health -and $health.service -eq $serviceId -and [int]$health.pid -eq [int]$metadata.pid -and $health.instance -eq $metadata.instance) {
            Write-Output "Already running: http://localhost:$Port"
            exit 0
        }
        throw 'This project process exists but is not healthy. Run stop-web.ps1 to stop only this server, then retry.'
    }
    # Stale metadata is left in place until the new server successfully listens and replaces it.
}

$health = Read-Health
if ($health) {
    if ($health.service -eq $serviceId -and (Test-OwnedProcess ([int]$health.pid))) {
        Write-Output "Already running: http://localhost:$Port"
        exit 0
    }
    throw "Port $Port is occupied by a different service. It was not stopped. Choose another -Port."
}

$runtimePath = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
$stdoutPath = Join-Path $runtimePath 'web.stdout.log'
$stderrPath = Join-Path $runtimePath 'web.stderr.log'
$arguments = '"' + $entryPath + '" --host 0.0.0.0 --port ' + $Port
$launchedProcess = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    $launchedProcess.Refresh()
    if ($launchedProcess.HasExited) {
        $details = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { 'No error log available.' }
        throw "Server exited during startup. $details"
    }
    $health = Read-Health
    if ($health -and $health.service -eq $serviceId -and [int]$health.pid -eq $launchedProcess.Id) {
        Write-Output "Started: http://localhost:$Port"
        Write-Output "PID: $($launchedProcess.Id)"
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' } |
            ForEach-Object { Write-Output "LAN candidate: http://$($_.IPAddress):$Port (same network; firewall may require access)" }
        exit 0
    }
}
throw 'Startup health check timed out. No unrelated process was stopped. Inspect .runtime logs and use stop-web.ps1 for this project server.'
