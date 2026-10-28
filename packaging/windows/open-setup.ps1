#requires -Version 5.1
param(
  [int]$TimeoutSeconds = 90,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$healthUrl = 'http://127.0.0.1:4000/api/health'
$setupUrl = 'http://localhost:4000/setup'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

do {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      if (-not $NoLaunch) { Start-Process $setupUrl }
      exit 0
    }
  }
  catch {
    # The service can take a moment to initialize SQLite on its first start.
  }

  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

Write-Error "CBT Hall Server did not become ready within $TimeoutSeconds seconds. Check C:\ProgramData\CBT\logs\CBT-Hall-Server.wrapper.log."
exit 1
