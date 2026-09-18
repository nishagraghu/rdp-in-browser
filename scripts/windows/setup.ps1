#Requires -Version 5.1
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/common.ps1"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " rdp-in-browser - Production Setup (Windows)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$ProjectRoot = Get-ProjectRoot

Write-Step "Checking prerequisites"
if (-not (Test-DockerInstalled)) { exit 1 }
if (-not (Test-DockerComposeInstalled)) { exit 1 }
Write-Success "Docker and Docker Compose are available."

Write-Step "Preparing directories"
Ensure-Directories -ProjectRoot $ProjectRoot

Write-Step "Validating environment configuration"
$envPath = Ensure-EnvFile -ProjectRoot $ProjectRoot
Test-RequiredEnvVars -EnvPath $envPath

$envValues = Read-EnvFile -EnvPath $envPath
$httpPort = 80
if ($envValues["HTTP_PORT"]) {
    [void][int]::TryParse($envValues["HTTP_PORT"], [ref]$httpPort)
}
if (-not (Test-PortAvailable -Port $httpPort)) { exit 1 }

$Compose = Get-ComposeCommand -ProjectRoot $ProjectRoot

Write-Step "Pulling Docker images (installs any that are not on this system)"
# Downloads guacd and any registry images (BACKEND_IMAGE / FRONTEND_IMAGE).
# Ignore failures for local-only tags so the next build step can create them.
$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    Invoke-Compose -Compose $Compose -Arguments @("pull", "--ignore-pull-failures")
} catch {
    Write-Host "Some images could not be pulled; will build locally if needed." -ForegroundColor Yellow
} finally {
    $ErrorActionPreference = $previousErrorAction
}

Write-Step "Building production Docker images (if needed)"
Invoke-Compose -Compose $Compose -Arguments @("build")

Write-Step "Starting application stack"
# --pull missing: if an image still is not local, pull it before starting
Invoke-Compose -Compose $Compose -Arguments @("up", "-d", "--remove-orphans", "--pull", "missing")

if (-not (Wait-ForHealthyServices -Compose $Compose)) {
    Invoke-Compose -Compose $Compose -Arguments @("ps")
    exit 1
}

Invoke-Compose -Compose $Compose -Arguments @("ps")
Show-ApplicationInfo -ProjectRoot $ProjectRoot

Write-Success "Setup complete."
