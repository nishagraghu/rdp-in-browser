#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$DistDir = Join-Path $ProjectRoot "distribution"
$Output = Join-Path $ProjectRoot "rdp-in-browser-distribution.zip"

if (-not (Test-Path $DistDir)) {
    Write-Host "[ERROR] distribution/ folder not found." -ForegroundColor Red
    exit 1
}

$required = @(
    "docker-compose.yml",
    ".env.example",
    "README.md",
    "start.sh",
    "start.ps1"
)

foreach ($name in $required) {
    if (-not (Test-Path (Join-Path $DistDir $name))) {
        Write-Host "[ERROR] Missing required file: $name" -ForegroundColor Red
        exit 1
    }
}

if (Test-Path $Output) {
    Remove-Item $Output -Force
}

$staging = Join-Path $env:TEMP "rdp-in-browser-distribution-$(Get-Random)"
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
    foreach ($name in $required) {
        Copy-Item (Join-Path $DistDir $name) (Join-Path $staging $name)
    }

    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $Output -Force
}
finally {
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[OK] Created $Output" -ForegroundColor Green
Write-Host "Send this ZIP to your customer. It contains no source code."
