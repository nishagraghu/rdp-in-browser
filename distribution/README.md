# rdp-in-browser — Deployment Guide

Browser-based remote desktop access powered by Apache Guacamole. This package contains **everything needed to run the application** — no source code, no build step.

---

## Requirements

| Item | Details |
|------|---------|
| Docker Engine | 24.0 or newer |
| Docker Compose | v2 (`docker compose` command) |
| CPU / RAM | 2 cores, 4 GB RAM minimum |
| Disk | 10 GB free (more if users upload files) |
| Network | Inbound port **80** (or the port you set in `.env`) |

Install Docker:

- **Windows:** [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
- **Linux:** [Docker Engine](https://docs.docker.com/engine/install/)
- **macOS:** [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

---

## Quick start (3 steps)

### 1. Unzip this folder

Place it anywhere on your server, for example:

- Windows: `C:\apps\rdp-in-browser\`
- Linux: `/opt/rdp-in-browser/`

### 2. Create your `.env` file

**Windows (PowerShell):**

```powershell
cd C:\apps\rdp-in-browser
copy .env.example .env
notepad .env
```

**Linux / macOS:**

```bash
cd /opt/rdp-in-browser
cp .env.example .env
nano .env
```

Set these three values (each at least 32 random characters):

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `VM_ENCRYPTION_KEY`

Generate a secure value:

```bash
openssl rand -base64 48
```

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3. Start the application

```bash
docker compose up -d
```

That is the only command required. Docker will download the application images and start three containers: web UI, API server, and the Guacamole RDP engine.

**Optional helper scripts** (same result as the command above):

- Windows: `powershell -ExecutionPolicy Bypass -File .\start.ps1`
- Linux / macOS: `chmod +x start.sh && ./start.sh`

---

## First-time setup

1. Open **http://localhost** (or `http://<your-server-ip>`).
2. Go to **http://localhost/setup** to create the administrator account.
3. Sign in and add virtual machines (RDP targets) from the admin dashboard.

Health check: **http://localhost/health** should return `ok`.

---

## Daily operations

| Action | Command |
|--------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Restart | `docker compose restart` |
| Status | `docker compose ps` |
| Logs | `docker compose logs -f` |
| Update to latest images | `docker compose pull && docker compose up -d` |

Data is stored in Docker volumes (`rdp-server-data`, `rdp-shared-drives`) and survives restarts.

---

## Configuration reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HTTP_PORT` | No | `80` | Port for the web interface |
| `JWT_ACCESS_SECRET` | **Yes** | — | Access token key (32+ chars) |
| `JWT_REFRESH_SECRET` | **Yes** | — | Refresh token key (32+ chars) |
| `VM_ENCRYPTION_KEY` | **Yes** | — | VM credential encryption key (32+ chars) |
| `CORS_ORIGIN` | No | `http://localhost` | Public URL users access |
| `AUTO_SEED` | No | `false` | Demo accounts (not for production) |

---

## Network notes

- Only the **web port** (`HTTP_PORT`, default 80) needs to be open on your firewall.
- RDP target machines must be reachable **from inside Docker** on port 3389 (or the port you configure per VM).

---

## Private container registry

If your vendor hosts images on a private registry, log in before starting:

```bash
docker login ghcr.io
```

Use the credentials provided by your vendor.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `docker: command not found` | Install Docker and ensure it is in your PATH |
| Docker daemon not running | Start Docker Desktop or `sudo systemctl start docker` |
| Port already in use | Change `HTTP_PORT` in `.env` (e.g. to `8080`) |
| Missing secrets | Fill all three required values in `.env` |
| Container unhealthy | Run `docker compose logs server` |
| RDP connection fails | Confirm the target PC is reachable from the Docker host on port 3389 |

```bash
docker compose ps
docker compose logs
```

---

## Backup

```bash
docker run --rm -v rdp-server-data:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/rdp-backup.tar.gz -C /data .
```

Stop the stack before restoring from a backup archive.

---

## Package contents

```text
rdp-in-browser/
├── docker-compose.yml   # Service definitions (pulls pre-built images)
├── .env.example         # Configuration template
├── README.md            # This file
├── start.sh             # Optional Linux/macOS starter
└── start.ps1            # Optional Windows starter
```

No application source code is included. Updates are delivered as new container images via `docker compose pull`.
