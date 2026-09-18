# rdp-in-browser — External User Guide

Browser-based remote desktop access. Open a Windows PC (or other RDP host) from Chrome, Edge, or Firefox — no VPN client and no remote-desktop software on your laptop.

This guide is for **external users and customer admins** who received the deployment package (ZIP). You do **not** need source code or a build step.

---

## What you receive

```text
rdp-in-browser/
├── docker-compose.yml   # Starts the app (pulls pre-built images)
├── .env.example         # Configuration template
├── README.md            # This guide
├── start.sh             # Optional starter (Linux / macOS)
└── start.ps1            # Optional starter (Windows)
```

| Role | What you do |
|------|-------------|
| **Server admin** | Install Docker, configure `.env`, start the stack, create users and VMs |
| **End user** | Sign in in the browser, click a machine, use the remote desktop |

---

## Requirements

| Item | Details |
|------|---------|
| Docker Engine | 24.0 or newer |
| Docker Compose | v2 (`docker compose`) |
| Hardware | 2 CPU cores, 4 GB RAM minimum |
| Disk | 10 GB free (more if users exchange files) |
| Network | Open inbound **HTTP_PORT** (default **80**) |

Install Docker:

- [Windows — Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Linux — Docker Engine](https://docs.docker.com/engine/install/)
- [macOS — Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

RDP target PCs must be reachable **from the Docker host** on port **3389** (or the port you configure per VM).

---

## Install (admin) — 3 steps

### 1. Unzip the package

Example locations:

- Windows: `C:\apps\rdp-in-browser\`
- Linux: `/opt/rdp-in-browser/`

### 2. Create `.env`

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

**Required** — set three secrets (each **32+** random characters):

| Variable | Purpose |
|----------|---------|
| `JWT_ACCESS_SECRET` | Signs login access tokens |
| `JWT_REFRESH_SECRET` | Signs refresh tokens |
| `VM_ENCRYPTION_KEY` | Encrypts stored RDP passwords |

Generate a secret:

```bash
openssl rand -base64 48
```

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Recommended:**

| Variable | Example | Purpose |
|----------|---------|---------|
| `HTTP_PORT` | `80` or `8888` | Web UI port on this server |
| `CORS_ORIGIN` | `https://rdp.company.com` | Exact URL users type in the browser |
| `DRIVES_PATH` | `D:/rdp_shared` | Host folder for the shared drive (see below) |

Leave `AUTO_SEED=false` in production.

### 3. Start

```bash
docker compose up -d
```

Optional helpers:

- Windows: `powershell -ExecutionPolicy Bypass -File .\start.ps1`
- Linux / macOS: `chmod +x start.sh && ./start.sh`

Docker downloads the images and starts three services: **frontend**, **server** (API + SQLite), and **guacd** (RDP engine).

---

## First-time setup (admin)

1. Open **http://localhost** (or `http://<server-ip>:<HTTP_PORT>`).
2. Go to **`/setup`** and create the administrator account.
3. Sign in → open **VM Management** → add each RDP target (hostname/IP, port, credentials).
4. Assign machines to users under user / assignment settings.
5. For file exchange, enable **Shared Drive** on each VM that should use it.

Health check: **`/health`** should return `ok`.

---

## Shared drive (file exchange)

Files are **not** downloaded through a separate browser download channel. They live in one shared folder on the Docker host and appear inside the remote session.

```text
Host folder:     DRIVES_PATH/{username}/     e.g. D:/rdp_shared/alice/
Remote session:  “Shared Drive” (drive letter inside Windows)
Web UI:          Shared Drive panel
```

### How to use it

| Action | Result |
|--------|--------|
| Drop a file into `DRIVES_PATH/{username}/` on the server | File appears in the remote **Shared Drive** and in the web **Shared Drive** panel |
| Copy a file into **Shared Drive** inside the remote desktop | File appears on the host under that user’s folder |
| Use **Upload to Shared Drive** in the session toolbar | File is saved into the same shared folder |

Each login name gets its own folder (created automatically), including a `Download` subfolder.

### Enable on a VM

In admin **VM Management** → edit the VM → enable **Shared Drive** → reconnect the session after saving.

Set `DRIVES_PATH` in `.env` to a folder that exists on the host (Windows example: `D:/rdp_shared`). Create the folder if needed before starting Docker.

---

## Using the app (end users)

1. Open the application URL your admin gave you.
2. Sign in with your username and password.
3. On the dashboard, click the machine you want to open.
4. Use the remote desktop in the browser.

### Session toolbar

| Control | Purpose |
|---------|---------|
| **Keys** | Send Ctrl+Alt+Del, Windows key, Alt+Tab, Escape |
| **Upload to Shared Drive** | Put a local file into the shared folder (also **Ctrl+Shift+Alt**) |
| **Fullscreen** | Fill the screen with the remote desktop |
| **Reconnect** | Restart the session if it drops |
| **Disconnect** | End the session cleanly |

### Tips

- Prefer **Shared Drive** for moving files; do not expect a normal “Save as…” browser download from the remote PC.
- If the screen looks small or cropped, use Fit / 100% zoom controls in the toolbar.
- In fullscreen, move the mouse to the top edge to show the toolbar again (behavior may vary by version).

---

## Daily operations (admin)

| Action | Command |
|--------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Restart | `docker compose restart` |
| Status | `docker compose ps` |
| Logs | `docker compose logs -f` |
| Update images | `docker compose pull && docker compose up -d` |

### Where data lives

| Data | Location |
|------|----------|
| App database (users, VMs, settings) | Docker volume **`rdp-server-data`** |
| Shared drive files | Host path **`DRIVES_PATH`** (default `D:/rdp_shared`) |

Stopping containers does **not** delete this data.

### Backup (database)

```bash
docker run --rm -v rdp-server-data:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/rdp-backup.tar.gz -C /data .
```

Also back up the `DRIVES_PATH` folder on the host if users store important files there. Stop the stack before restoring a database backup.

---

## Configuration reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HTTP_PORT` | No | `80` | Web UI port on the host |
| `JWT_ACCESS_SECRET` | **Yes** | — | Access token secret (32+ chars) |
| `JWT_REFRESH_SECRET` | **Yes** | — | Refresh token secret (32+ chars) |
| `VM_ENCRYPTION_KEY` | **Yes** | — | VM password encryption key (32+ chars) |
| `DRIVES_PATH` | No | `D:/rdp_shared` | Host folder for shared-drive files |
| `CORS_ORIGIN` | No | `http://localhost` | Public URL users use in the browser |
| `AUTO_SEED` | No | `false` | Demo accounts — leave `false` in production |
| `BACKEND_IMAGE` / `FRONTEND_IMAGE` | No | Vendor defaults | Image names from your vendor |

---

## Private container registry

If your vendor uses a private registry:

```bash
docker login ghcr.io
```

Use the username and token they provided, then run `docker compose up -d`.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `docker: command not found` | Install Docker and reopen the terminal |
| Docker daemon not running | Start Docker Desktop, or `sudo systemctl start docker` |
| Port already in use | Change `HTTP_PORT` in `.env` (e.g. `8888`) |
| Setup page / login fails | Confirm all three secrets are set in `.env`, then `docker compose up -d` again |
| Container unhealthy | `docker compose logs server` |
| Cannot connect to RDP | From the Docker host, confirm the target answers on 3389; check VM username/password in admin |
| Shared drive empty | Enable Shared Drive on the VM, set `DRIVES_PATH`, reconnect; check `DRIVES_PATH/{username}/` on the host |
| Images won’t pull | Run `docker login` if the registry is private; check `BACKEND_IMAGE` / `FRONTEND_IMAGE` |

```bash
docker compose ps
docker compose logs
```

---

## Support

Contact your vendor or internal IT team with:

- Application URL and approximate time of the issue  
- Output of `docker compose ps` and `docker compose logs --tail=100`  
- Whether the problem is login, RDP connect, or shared drive files  

---

## Privacy note

This package contains **no application source code**. Updates are delivered as new container images (`docker compose pull`).
