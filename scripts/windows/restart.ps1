#Requires -Version 5.1
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/common.ps1"

$ProjectRoot = Get-ProjectRoot
$Compose = Get-ComposeCommand -ProjectRoot $ProjectRoot

Write-Step "Restarting rdp-in-browser"
Invoke-Compose -Compose $Compose -Arguments @("restart")

if (-not (Wait-ForHealthyServices -Compose $Compose)) {
    exit 1
}

Show-ApplicationInfo -ProjectRoot $ProjectRoot
