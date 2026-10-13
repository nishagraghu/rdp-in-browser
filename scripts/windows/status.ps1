#Requires -Version 5.1
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/common.ps1"

$ProjectRoot = Get-ProjectRoot

if (-not (Test-DockerInstalled)) { exit 1 }

$Compose = Get-ComposeCommand -ProjectRoot $ProjectRoot

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " rdp-in-browser - Service Status" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

Invoke-Compose -Compose $Compose -Arguments @("ps")

$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path $envPath) {
    Show-ApplicationInfo -ProjectRoot $ProjectRoot
}
