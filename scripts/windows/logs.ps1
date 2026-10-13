#Requires -Version 5.1
param(
    [string]$Service = "",
    [switch]$Follow
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot/common.ps1"

$ProjectRoot = Get-ProjectRoot
$Compose = Get-ComposeCommand -ProjectRoot $ProjectRoot

$args = @("logs")
if ($Follow) { $args += "-f" }
if ($Service) { $args += $Service }

Invoke-Compose -Compose $Compose -Arguments $args
