#Requires -Version 5.1
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/common.ps1"

$ProjectRoot = Get-ProjectRoot

if (-not (Test-DockerInstalled)) { exit 1 }
if (-not (Test-DockerComposeInstalled)) { exit 1 }

$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Fail ".env not found. Run scripts\windows\setup.ps1 first."
    exit 1
}

Test-RequiredEnvVars -EnvPath $envPath

$Compose = Get-ComposeCommand -ProjectRoot $ProjectRoot

Write-Step "Starting rdp-in-browser"
Invoke-Compose -Compose $Compose -Arguments @("up", "-d", "--remove-orphans")

if (-not (Wait-ForHealthyServices -Compose $Compose)) {
    exit 1
}

Show-ApplicationInfo -ProjectRoot $ProjectRoot
