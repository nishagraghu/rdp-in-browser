#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
Set-Location $Root

function Fail([string]$Message) {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker is not installed. See README.md for install links."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker daemon is not running. Start Docker Desktop and retry."
}

docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker Compose v2 is required (docker compose)."
}

$envPath = Join-Path $Root ".env"
$examplePath = Join-Path $Root ".env.example"

if (-not (Test-Path $envPath)) {
    if (-not (Test-Path $examplePath)) {
        Fail ".env.example is missing."
    }
    Copy-Item $examplePath $envPath
    Fail "Created .env from .env.example. Edit .env, set the three secrets, then run this script again."
}

$required = @("JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "VM_ENCRYPTION_KEY")
foreach ($name in $required) {
    $line = Select-String -Path $envPath -Pattern "^${name}=" | Select-Object -Last 1
    $value = if ($line) { ($line.Line -split "=", 2)[1].Trim() } else { "" }
    if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -lt 32) {
        Fail "${name} must be set in .env (minimum 32 characters). See README.md."
    }
}

Write-Host "==> Pulling latest images..." -ForegroundColor Cyan
docker compose pull
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Starting rdp-in-browser..." -ForegroundColor Cyan
docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$httpPort = "80"
$portLine = Select-String -Path $envPath -Pattern "^HTTP_PORT=" | Select-Object -Last 1
if ($portLine) {
    $httpPort = ($portLine.Line -split "=", 2)[1].Trim()
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " rdp-in-browser is starting" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host " Application : http://localhost:${httpPort}"
Write-Host " Setup       : http://localhost:${httpPort}/setup"
Write-Host " Health      : http://localhost:${httpPort}/health"
Write-Host "==================================================" -ForegroundColor Green
