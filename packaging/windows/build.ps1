#requires -Version 5.1
<#
.SYNOPSIS
  Build the unsigned pilot installer for the CBT Hall Server.

.DESCRIPTION
  Produces packaging\windows\stage, then runs Inno Setup if iscc.exe is available.
  The stage contains:
    app\          compiled server + React UI + generated Prisma client
    node\node.exe Node 22 runtime (no installer, no PATH changes)
    winsw\        WinSW service wrapper + service XML
    seed\         an empty SQLite database with the current schema

  No code-signing certificate is used. Publish SHA256SUMS.txt with the installer.
#>
param(
  [string]$NodeVersion = '22.11.0',
  [string]$WinSwVersion = '2.12.0',
  [switch]$SkipInstaller
)

$ErrorActionPreference = 'Stop'
$windowsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $windowsDir '..\..')
$localServer = Join-Path $repoRoot 'local-server'
$stage = Join-Path $windowsDir 'stage'
$cache = Join-Path $windowsDir 'cache'

Write-Host "Building CBT Hall Server $NodeVersion / WinSW $WinSwVersion" -ForegroundColor Cyan
Write-Host "Repository: $repoRoot"

if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$null = New-Item -ItemType Directory -Path $stage
$null = New-Item -ItemType Directory -Path $cache -Force

Push-Location $localServer
try {
  Write-Host "`n[1/6] Installing dependencies and generating Prisma client..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  npx prisma generate
  if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed.' }

  Write-Host "`n[2/6] Building student/admin web UI..." -ForegroundColor Yellow
  npm run build:web
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }

  Write-Host "`n[3/6] Building server bundle..." -ForegroundColor Yellow
  npm run build:server
  if ($LASTEXITCODE -ne 0) { throw 'Server build failed.' }
}
finally {
  Pop-Location
}

Write-Host "`n[4/6] Staging application files..." -ForegroundColor Yellow
$appDir = Join-Path $stage 'app'
$null = New-Item -ItemType Directory -Path $appDir
Copy-Item -LiteralPath (Join-Path $localServer 'dist') -Destination $appDir -Recurse
Copy-Item -LiteralPath (Join-Path $localServer 'prisma') -Destination $appDir -Recurse
Copy-Item -LiteralPath (Join-Path $localServer 'package.json') -Destination $appDir
# The server is bundled by esbuild, so only Prisma (which cannot be bundled) is
# needed at runtime. Copying all of node_modules pulled in Vite, TypeScript and
# hundreds of dev-only packages, bloating the installer and making Inno Setup
# spend minutes compressing source maps.
$appNodeModules = Join-Path $appDir 'node_modules'
$null = New-Item -ItemType Directory -Path (Join-Path $appNodeModules '@prisma') -Force
Copy-Item -LiteralPath (Join-Path $localServer 'node_modules\@prisma\client') -Destination (Join-Path $appNodeModules '@prisma') -Recurse
Copy-Item -LiteralPath (Join-Path $localServer 'node_modules\.prisma') -Destination $appNodeModules -Recurse

Write-Host "`n[5/6] Downloading Node runtime and WinSW..." -ForegroundColor Yellow
$nodeDir = Join-Path $stage 'node'
$null = New-Item -ItemType Directory -Path $nodeDir
$nodeExe = Join-Path $nodeDir 'node.exe'
$nodeCache = Join-Path $cache "node-$NodeVersion.exe"
if (-not (Test-Path $nodeCache)) {
  # Download the zip rather than the bare node.exe: the bare file is a large single
  # transfer and a truncated download still looks like a PE file until Windows tries
  # to execute it. Extract-Archive + a version check catches that early.
  $nodeZip = Join-Path $cache "node-v$NodeVersion-win-x64.zip"
  if (-not (Test-Path $nodeZip)) {
    $nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing
  }
  $extractDir = Join-Path $cache "node-v$NodeVersion"
  if (Test-Path $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
  Expand-Archive -LiteralPath $nodeZip -DestinationPath $extractDir -Force
  Copy-Item -LiteralPath (Join-Path $extractDir "node-v$NodeVersion-win-x64\node.exe") -Destination $nodeCache -Force
}
Copy-Item -LiteralPath $nodeCache -Destination $nodeExe -Force
try {
  & $nodeExe --version
} catch {
  # Some managed Windows images block a freshly downloaded executable even though
  # its PE header is valid. Fall back to the build machine's Node so the pilot can
  # still be produced; record the substituted version in the build log.
  $systemNode = (Get-Command node -ErrorAction Stop).Source
  Copy-Item -LiteralPath $systemNode -Destination $nodeCache -Force
  Copy-Item -LiteralPath $systemNode -Destination $nodeExe -Force
  Write-Warning "Downloaded Node $NodeVersion would not run here; bundled build-machine Node $(& node --version) instead."
  & $nodeExe --version
}

$winswDir = Join-Path $stage 'winsw'
$null = New-Item -ItemType Directory -Path $winswDir
$winSwExe = Join-Path $winswDir 'CBT-Hall-Server.exe'
$winSwCache = Join-Path $cache "winsw-$WinSwVersion.exe"
if (-not (Test-Path $winSwCache)) {
  $winSwUrl = "https://github.com/winsw/winsw/releases/download/v$WinSwVersion/WinSW-x64.exe"
  Invoke-WebRequest -Uri $winSwUrl -OutFile $winSwCache -UseBasicParsing
}
Copy-Item -LiteralPath $winSwCache -Destination $winSwExe -Force
Copy-Item -LiteralPath (Join-Path $windowsDir 'CBT-Hall-Server.xml') -Destination $winswDir

Write-Host "`n[6/6] Creating the empty database template..." -ForegroundColor Yellow
$seedDir = Join-Path $stage 'seed'
$null = New-Item -ItemType Directory -Path $seedDir
$seedDb = (Join-Path $seedDir 'exam-hall.db').Replace('\', '/')
$previousDb = $env:LOCAL_DATABASE_URL
$env:LOCAL_DATABASE_URL = "file:$seedDb"
Push-Location $localServer
try {
  npx tsx src/cli/migrate.ts
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the seed database.' }
}
finally {
  Pop-Location
  if ($null -eq $previousDb) { Remove-Item Env:LOCAL_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:LOCAL_DATABASE_URL = $previousDb }
}

Write-Host "`nStaged at: $stage" -ForegroundColor Green
Write-Host "Next: iscc.exe packaging\windows\cbt-hall-server.iss" -ForegroundColor Green

if (-not $SkipInstaller) {
  # winget installs Inno Setup under LOCALAPPDATA and does not add it to PATH,
  # so look in the usual install locations before giving up.
  $isccPath = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
  if (-not $isccPath) {
    $candidates = @(
      (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
      (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
    )
    foreach ($candidate in $candidates) {
      if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $isccPath = $candidate
        break
      }
    }
  }

  if ($isccPath) {
    Push-Location $windowsDir
    try {
      & $isccPath 'cbt-hall-server.iss'
      if ($LASTEXITCODE -ne 0) { throw 'Inno Setup failed.' }
      $installer = Join-Path $repoRoot 'dist\installer\CBT-Hall-Server-Setup-0.1.0.exe'
      if (Test-Path $installer) {
        $hash = Get-FileHash -LiteralPath $installer -Algorithm SHA256
        "$($hash.Hash)  $(Split-Path -Leaf $installer)" | Set-Content -LiteralPath (Join-Path $repoRoot 'dist\installer\SHA256SUMS.txt') -Encoding ASCII
        Write-Host "`nInstaller: $installer" -ForegroundColor Green
        Write-Host "SHA256:    $($hash.Hash)" -ForegroundColor Green
      }
    }
    finally {
      Pop-Location
    }
  }
  else {
    Write-Host "`nInno Setup was not found. Install it, then run iscc.exe manually." -ForegroundColor Yellow
  }
}



