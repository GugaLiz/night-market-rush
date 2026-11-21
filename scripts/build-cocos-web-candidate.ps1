param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$OutputName,
    [string]$CreatorPath = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = Join-Path $projectRoot 'cocos'
$output = Join-Path $source "build/$OutputName"
if (Test-Path -LiteralPath $output) { throw 'Output already exists; choose a new OutputName. Nothing was overwritten.' }
if (!$CreatorPath) {
    $CreatorPath = Join-Path $env:LOCALAPPDATA 'Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/CocosCreatorCache/3.8.8/CocosCreator.exe'
}
if (!(Test-Path -LiteralPath $CreatorPath -PathType Leaf)) { throw 'Creator 3.8.8 not found; supply -CreatorPath.' }
$package = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
if ($package.creator.version -ne '3.8.8') { throw 'Candidate build requires the project-pinned Creator 3.8.8.' }
$runtime = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$snapshot = Join-Path $runtime ('cocos-web-candidate-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $snapshot | Out-Null
foreach($name in @('assets','settings','build-templates','package.json','tsconfig.json')) {
    $item=Join-Path $source $name
    if (!(Test-Path -LiteralPath $item)) { throw "Missing project item: $name" }
    Copy-Item -LiteralPath $item -Destination $snapshot -Recurse
}
$policy = Join-Path $snapshot 'assets/scripts/runtime/web-build-policy.ts'
$text = Get-Content -LiteralPath $policy -Raw
$needle = 'export const WEB_PERSISTENCE_CANDIDATE: boolean = false;'
$changed = 'export const WEB_PERSISTENCE_CANDIDATE: boolean = true;'
if (($text.Split(@($needle),[StringSplitOptions]::None).Count -ne 2) -or $text.Contains($changed)) { throw 'Unexpected candidate policy; original source was not changed.' }
$text.Replace($needle,$changed) | Set-Content -LiteralPath $policy -Encoding utf8 -NoNewline
$argsList = @('--project', ('"' + $snapshot + '"'), '--build', ('"platform=web-mobile;debug=false;replaceSplashScreen=true;outputName=' + $OutputName + '"'))
$process=Start-Process -FilePath $CreatorPath -ArgumentList $argsList -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 36) { throw "Creator build did not report success (exit $($process.ExitCode)); snapshot retained at $snapshot." }
$built=Join-Path $snapshot "build/$OutputName"
if (!(Test-Path -LiteralPath (Join-Path $built 'index.html') -PathType Leaf)) { throw 'Creator did not create the expected entry.' }
$settings=Get-Content -LiteralPath (Join-Path $built 'src/settings.json') -Raw | ConvertFrom-Json
if ($settings.CocosEngine -ne '3.8.8' -or $settings.engine.debug -ne $false -or $settings.engine.platform -ne 'web-mobile') { throw 'Unexpected Creator build settings; output was not copied.' }
if ($settings.splashScreen.logo.type -ne 'custom') { throw 'Creator did not enable the configured custom splash logo; output was not copied.' }
if (Test-Path -LiteralPath $output) { throw 'Output appeared during build; nothing was overwritten.' }
Copy-Item -LiteralPath $built -Destination $output -Recurse
@{purpose='isolated-web-release-candidate';prototype=$true;engine='3.8.8';debug=$false;existingSaveEnabled=$true;sourcePolicy='development-disabled';snapshot=$snapshot;builtAt=[DateTimeOffset]::UtcNow.ToString('o')} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'candidate-build.json') -Encoding utf8
Write-Output "Created DEVELOPMENT PROTOTYPE candidate for isolated testing: $output"
Write-Output "Source project and dist were not switched. Snapshot: $snapshot"
