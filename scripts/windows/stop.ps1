#Requires -Version 5.1
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/common.ps1"

$ProjectRoot = Get-ProjectRoot
$Compose = Get-ComposeCommand -ProjectRoot $ProjectRoot

Write-Step "Stopping rdp-in-browser"
Invoke-Compose -Compose $Compose -Arguments @("stop")

Write-Success "Application stopped. Data volumes were preserved."
