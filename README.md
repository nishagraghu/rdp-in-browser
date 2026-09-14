# rdp-in-browser

Browser-based RDP client powered by Apache Guacamole.

**Production deployment:** see [README-PRODUCTION.md](README-PRODUCTION.md).

## Quick Start (Production)

1. Copy `.env.example` to `.env` and configure secrets.
2. Run the setup script for your platform:
   - Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1`
   - Linux: `./scripts/linux/setup.sh`
3. Open the application URL and complete first-time setup at `/setup`.

## Architecture

```
Browser (React + nginx)
   └── WebSocket/API (Node.js server)
         └── guacd (Apache Guacamole daemon)
               └── RDP target machine
```
