# rdp-in-browser — Production Deployment Guide

This document describes how to deploy **rdp-in-browser** on a production server using Docker. The deployment runs three containers:

| Service | Role | Exposed to host |
|---------|------|-----------------|
| **frontend** | React UI + nginx reverse proxy | Yes (`HTTP_PORT`, default 80) |
| **server** | API + Guacamole WebSocket bridge | No (internal network only) |
| **guacd** | Apache Guacamole daemon for RDP | No (internal network only) |

After deployment, open the application URL and complete **first-time setup** at `/setup` to create the administrator account.

---

## Prerequisites

### Software

| Requirement | Minimum version |
|-------------|-----------------|
| Docker Engine | 24.0+ |
| Docker Compose | v2 (`docker compose`) |

Install guides:

- Windows: [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- Linux: [Docker Engine on Linux](https://docs.docker.com/engine/install/)

### Server resources

| Resource | Recommended minimum |
|----------|---------------------|
| CPU | 2 cores |
| RAM | 4 GB |
| Disk | 10 GB free (plus space for user drive uploads) |

### Network

| Port | Direction | Purpose |
|------|-----------|---------|
| `HTTP_PORT` (default **80**) | Inbound | Web application (frontend/nginx) |

The backend API (3001) and guacd (4822) are **not** published to the host. They communicate over an internal Docker network.

Your RDP target machines must be reachable **from the guacd container** on port 3389 (or the port configured per VM).

### Permissions

- Docker must be installed and the deploying user must be able to run `docker` and `docker compose`.
- On Linux, add the user to the `docker` group or use `sudo` for Docker commands.
- On Windows Server, Docker Desktop or Docker Engine with WSL2 backend is required.

---

## Deployment Package Structure

```text
/
├── frontend/
├── server/
├── docker/
│   ├── frontend/
│   └── backend/
├── scripts/
│   ├── windows/
│   └── linux/
├── docker-compose.yml
├── .env.example
└── README-PRODUCTION.md
```

---

## Windows Installation

### 1. Copy or extract the deployment package

```powershell
C:\apps\rdp-in-browser\
```

### 2. Configure environment variables

```powershell
cd C:\apps\rdp-in-browser
copy .env.example .env
notepad .env
```

Fill in **all required secrets** (minimum 32 characters each):

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `VM_ENCRYPTION_KEY`

Generate a secure value in PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Leave `AUTO_SEED=false` for production.

### 3. Run the setup script

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1
```

### 4. Complete first-time setup

Open `http://localhost/setup` (or your configured port) and create the administrator account.

---

## Linux Installation

### 1. Copy or extract the deployment package

```bash
/opt/rdp-in-browser/
```

### 2. Configure environment variables

```bash
cd /opt/rdp-in-browser
cp .env.example .env
nano .env
```

Generate a secure value:

```bash
openssl rand -base64 48
```

### 3. Run the setup script

```bash
chmod +x scripts/linux/*.sh
./scripts/linux/setup.sh
```

### 4. Complete first-time setup

Open `http://<server-ip>/setup` and create the administrator account.

---

## Start / Stop / Restart / Status / Logs

### Windows

| Action | Command |
|--------|---------|
| Start | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\start.ps1` |
| Stop | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\stop.ps1` |
| Restart | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\restart.ps1` |
| Status | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\status.ps1` |
| Logs | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\logs.ps1` |
| Follow logs | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\logs.ps1 -Follow` |

### Linux

| Action | Command |
|--------|---------|
| Start | `./scripts/linux/start.sh` |
| Stop | `./scripts/linux/stop.sh` |
| Restart | `./scripts/linux/restart.sh` |
| Status | `./scripts/linux/status.sh` |
| Logs | `./scripts/linux/logs.sh` |
| Follow logs | `./scripts/linux/logs.sh --follow` |

All stop/start operations **preserve Docker volumes** and existing data.

---

## Manual Docker Commands

```bash
docker compose build
docker compose up -d
docker compose ps
curl http://localhost/health
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HTTP_PORT` | No | `80` | Host port for the web UI |
| `JWT_ACCESS_SECRET` | **Yes** | — | Access token signing key (32+ chars) |
| `JWT_REFRESH_SECRET` | **Yes** | — | Refresh token signing key (32+ chars) |
| `VM_ENCRYPTION_KEY` | **Yes** | — | VM credential encryption key (32+ chars) |
| `ENCRYPTION_KEY` | No | Same as `VM_ENCRYPTION_KEY` | Guacamole WebSocket encryption |
| `AUTO_SEED` | No | `false` | Demo accounts (not for production) |
| `BACKEND_IMAGE` | No | build locally | Pre-built backend image |
| `FRONTEND_IMAGE` | No | build locally | Pre-built frontend image |

See `.env.example` for the full template.

---

## Updating the Application

```bash
git pull
docker compose build
docker compose up -d
```

Schema updates run automatically on server startup via `prisma db push`.

### Pre-built images

```env
BACKEND_IMAGE=ghcr.io/atvriders/rdp-in-browser-server:prod
FRONTEND_IMAGE=ghcr.io/atvriders/rdp-in-browser-frontend:prod
```

```bash
docker compose pull
docker compose up -d
```

Persistent data lives in Docker volume `rdp-server-data` (SQLite). Shared drive files live on the host path set by `DRIVES_PATH` (default `D:/rdp_shared`).

---

## Backup and Restore

```bash
docker run --rm -v rdp-server-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/rdp-server-data-backup.tar.gz -C /data .
```

Stop the app before restore, extract the archive into the volume, then start again.

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| Docker not running | Start Docker Desktop or `sudo systemctl start docker` |
| Port in use | Change `HTTP_PORT` in `.env` |
| Missing env vars | Set all required secrets in `.env` (32+ chars) |
| Container failed | `docker compose logs server` |
| Health check fails | `curl -v http://localhost/health` |
| RDP fails | Ensure target is reachable from the guacd container |

```bash
docker compose ps
docker compose logs
docker volume ls | grep rdp
```
