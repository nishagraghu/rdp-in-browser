# Distribution Guide (Vendor)

How to ship **rdp-in-browser** to customers **without sharing source code**. Customers receive a small folder (or ZIP) and run the app with Docker — they never see your frontend, server, or Docker build files.

---

## How it works

| You (vendor) | Customer |
|--------------|----------|
| Build & publish Docker images to a registry | Receive `distribution/` folder or ZIP |
| Share only the `distribution/` package | Copy `.env.example` → `.env`, set secrets |
| Keep the full repo private | Run `docker compose up -d` |

The customer package lives in **`distribution/`** and contains:

- `docker-compose.yml` — pulls pre-built images (no `build:` sections)
- `.env.example` — configuration template
- `README.md` — customer-facing deployment guide
- `start.sh` / `start.ps1` — optional one-command starters

---

## 1. Publish container images

Images are built automatically by GitHub Actions when you push to `prod`, `main`, or `master` (see `.github/workflows/docker.yml`).

Published tags (default):

```text
ghcr.io/<your-org>/rdp-in-browser-server:prod
ghcr.io/<your-org>/rdp-in-browser-frontend:prod
```

### Update image names for your org

Edit `distribution/.env.example` and set:

```env
BACKEND_IMAGE=ghcr.io/YOUR_ORG/rdp-in-browser-server:prod
FRONTEND_IMAGE=ghcr.io/YOUR_ORG/rdp-in-browser-frontend:prod
```

### Manual build & push (optional)

```bash
docker build -f docker/backend/Dockerfile -t ghcr.io/YOUR_ORG/rdp-in-browser-server:prod .
docker build -f docker/frontend/Dockerfile -t ghcr.io/YOUR_ORG/rdp-in-browser-frontend:prod .
docker push ghcr.io/YOUR_ORG/rdp-in-browser-server:prod
docker push ghcr.io/YOUR_ORG/rdp-in-browser-frontend:prod
```

### Private vs public images

- **Public GHCR packages:** customers run `docker compose up -d` with no login.
- **Private packages:** give customers a read-only token and have them run `docker login ghcr.io` first (documented in `distribution/README.md`).

---

## 2. Create the customer ZIP

From the repository root:

**Linux / macOS:**

```bash
chmod +x scripts/linux/package-distribution.sh
./scripts/linux/package-distribution.sh
```

**Windows:**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\package-distribution.ps1
```

Output: **`rdp-in-browser-distribution.zip`** in the repo root.

Send that ZIP to your customer. They unzip it and follow `README.md` inside.

---

## 3. What to send vs keep private

### Send to customer (ZIP contents only)

```text
rdp-in-browser/
├── docker-compose.yml
├── .env.example
├── README.md
├── start.sh
└── start.ps1
```

### Keep private (never include in the ZIP)

```text
frontend/
server/
docker/backend/
docker/frontend/
scripts/ (except packaging)
.github/
```

---

## 4. Customer quick reference

After unzipping and configuring `.env`:

```bash
docker compose up -d
```

First visit: **http://&lt;server&gt;/setup** to create the admin account.

Updates you release:

```bash
docker compose pull && docker compose up -d
```

---

## 5. Versioning releases

Tag releases in git so images get semver tags:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Point customers at a specific tag by updating their `.env`:

```env
BACKEND_IMAGE=ghcr.io/YOUR_ORG/rdp-in-browser-server:1.2.0
FRONTEND_IMAGE=ghcr.io/YOUR_ORG/rdp-in-browser-frontend:1.2.0
```

---

## 6. Customizing the customer README

Edit `distribution/README.md` before packaging if you need to:

- Replace default image registry paths
- Add support contact information
- Document license terms
- Add company branding

Re-run the packaging script after changes.
