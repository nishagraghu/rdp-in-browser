# Shared helpers for Windows deployment scripts

function Get-ProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail([string]$Message) {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-DockerInstalled {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Fail "Docker is not installed or not in PATH."
        Write-Host "Install Docker Desktop for Windows: https://docs.docker.com/desktop/setup/install/windows-install/"
        return $false
    }

    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        docker info *> $null
        $dockerOk = ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }

    if (-not $dockerOk) {
        Write-Fail "Docker is installed but the daemon is not running."
        Write-Host "Start Docker Desktop and wait until it reports 'Docker Desktop is running', then retry."
        return $false
    }

    return $true
}

function Test-DockerComposeInstalled {
    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Docker Compose v2 is not available."
        Write-Host "Install or update Docker Desktop to include 'docker compose'."
        return $false
    }

    return $true
}

function Ensure-Directories {
    param([string]$ProjectRoot)

    $dirs = @(
        (Join-Path $ProjectRoot "server/data")
    )

    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Success "Created directory: $dir"
        }
    }
}

function Read-EnvFile([string]$EnvPath) {
    $values = @{}

    if (-not (Test-Path $EnvPath)) {
        return $values
    }

    Get-Content $EnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) {
            return
        }

        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $values[$parts[0].Trim()] = $parts[1].Trim().TrimEnd("`r")
        }
    }

    return $values
}

function Ensure-EnvFile {
    param([string]$ProjectRoot)

    $envPath = Join-Path $ProjectRoot ".env"
    $examplePath = Join-Path $ProjectRoot ".env.example"

    if (-not (Test-Path $examplePath)) {
        Write-Fail ".env.example is missing from the project root."
        exit 1
    }

    if (-not (Test-Path $envPath)) {
        Copy-Item $examplePath $envPath
        Write-Warn "Created .env from .env.example."
        Write-Host "Edit .env and set all required secrets before continuing."
        exit 1
    }

    return $envPath
}

function Test-RequiredEnvVars {
    param([string]$EnvPath)

    $required = @(
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
        "VM_ENCRYPTION_KEY"
    )

    $values = Read-EnvFile -EnvPath $EnvPath
    $missing = @()

    foreach ($name in $required) {
        $value = $values[$name]
        if ([string]::IsNullOrWhiteSpace($value)) {
            $missing += $name
            continue
        }

        if ($value.Length -lt 32) {
            Write-Fail "$name must be at least 32 characters."
            exit 1
        }
    }

    if ($missing.Count -gt 0) {
        Write-Fail "Missing required values in .env: $($missing -join ', ')"
        Write-Host "Generate secure values with:"
        Write-Host '  [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))'
        exit 1
    }

    if ($values["AUTO_SEED"] -eq "true") {
        Write-Warn "AUTO_SEED=true will create demo accounts on first startup. Not recommended for production."
    }
}

function Get-ComposeCommand {
    param([string]$ProjectRoot)

    return @{
        File = Join-Path $ProjectRoot "docker-compose.yml"
        ProjectRoot = $ProjectRoot
    }
}

function Invoke-Compose {
    param(
        [hashtable]$Compose,
        [string[]]$Arguments
    )

    Push-Location $Compose.ProjectRoot
    try {
        & docker compose -f $Compose.File @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose failed: $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Wait-ForHealthyServices {
    param(
        [hashtable]$Compose,
        [int]$TimeoutSeconds = 180
    )

    Write-Step "Waiting for services to become healthy (timeout: ${TimeoutSeconds}s)..."

    $services = @(
        @{ Name = "guacd"; RequireHealthy = $false },
        @{ Name = "server"; RequireHealthy = $true },
        @{ Name = "frontend"; RequireHealthy = $true }
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $allHealthy = $true

        foreach ($service in $services) {
            $serviceName = $service.Name
            $status = docker compose -f $Compose.File ps --format json $serviceName 2>$null | ConvertFrom-Json
            if (-not $status) {
                $allHealthy = $false
                break
            }

            $health = $status.Health
            if ($service.RequireHealthy) {
                if ($health -ne "healthy") {
                    $allHealthy = $false
                    break
                }
            }
            elseif ($status.State -ne "running") {
                $allHealthy = $false
                break
            }
        }

        if ($allHealthy) {
            Write-Success "All services are healthy."
            return $true
        }

        Start-Sleep -Seconds 5
    }

    Write-Fail "Timed out waiting for services to become healthy."
    Write-Host "Check logs with: scripts/windows/logs.ps1"
    return $false
}

function Show-ApplicationInfo {
    param([string]$ProjectRoot)

    $values = Read-EnvFile -EnvPath (Join-Path $ProjectRoot ".env")
    $httpPort = if ($values["HTTP_PORT"]) { $values["HTTP_PORT"] } else { "80" }
    $corsOrigin = if ($values["CORS_ORIGIN"]) { $values["CORS_ORIGIN"] } else { "http://localhost" }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " rdp-in-browser is running" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " Application URL : http://localhost:$httpPort"
    Write-Host " Health check    : http://localhost:$httpPort/health"
    Write-Host " First-time setup: http://localhost:$httpPort/setup"
    Write-Host " Public URL hint : $corsOrigin"
    Write-Host ""
    Write-Host " Persistent data : Docker volume 'rdp-server-data'"
    Write-Host " Shared drives   : Docker volume 'rdp-shared-drives'"
    Write-Host "==================================================" -ForegroundColor Green
}

function Test-PortAvailable {
    param([int]$Port)

    if ($Port -le 0) {
        return $true
    }

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
    try {
        $listener.Start()
        $listener.Stop()
        return $true
    }
    catch {
        Write-Fail "Port $Port is already in use on this host."
        Write-Host "Change HTTP_PORT in .env or stop the process using that port."
        return $false
    }
}
