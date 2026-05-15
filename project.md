# Plexamp Sonos Speed Dial

A self-hosted web app for a very specific home-audio workflow: browse your Plex music library, start playback on **Plexamp headless** players, and route that audio to **Sonos** speakers over **Line-In**—so you get Plexamp’s crossfades and queue behavior on real Sonos hardware without Plexamp’s casting UI.

The stack is API-first (FastAPI + OpenAPI), with a React single-page UI served behind nginx in Docker. Configuration (Plex URL, OAuth token, Sonos discovery, per-player line-in) lives in Postgres and is edited through an in-app **Setup** modal.

---

## Standout features

### Plexamp → Sonos via Line-In

Each Plexamp player can be bound to a Sonos speaker that exposes Line-In. On play, the backend coordinates Plexamp’s companion HTTP API (queue creation, play/pause/skip) with Sonos control (switch input, group speakers, volume). You can also target Plexamp only and skip Sonos routing.

### Flexible “pick music” browsing

Play from playlists, albums, artists, individual tracks, or a **random album** drawn from a Plex collection. Artist playback supports **artist radio** (station) vs library-only tracks. Playlist and artist flows support **shuffle**. Track preview loads up to 50 tracks with client and server timeouts so huge playlists do not hang the API.

### Speed dial favorites

Save any current pick (media type, IDs, player, speakers, shuffle/radio flags) as a one-tap **speed dial** button with cover art. Replay or delete favorites from the main screen without re-navigating the library.

### Play to: speakers, players, and presets

A collapsible **Play to** section lists Sonos speakers and Plexamp players in selectable grids (with visual selection state). **Group presets** store named multi-speaker Sonos groups. Speaker selection persists in `localStorage` across reloads.

### Live playback controls

Sticky bottom **control rail**: play, pause, stop, skip, volume up/down for the active Plexamp player and grouped Sonos targets. Playback state can be polled or streamed over a **WebSocket** for near-real-time UI updates.

### Setup and Plex auth

Browser **Plex OAuth** (PIN flow) with server URL, TLS verification toggle, and connectivity test. Multiple Plexamp players are registered by host. Sonos discovery supports **seed IPs** when SSDP does not work (typical in Docker). Credits and diagnostics live in Setup and a separate credits route.

### PWA and Cloudflare Access–friendly deploy

The UI is built as a **progressive web app** (manifest + service worker). A Vite plugin **inlines the web manifest** as a data URL so protected deployments (e.g. Cloudflare Access) are not broken by a separate `/manifest.webmanifest` redirect to login. nginx proxies `/api` to the API container with tuned timeouts for slow Plex responses.

---

## Major technologies

| Area | Technologies |
|------|----------------|
| **Frontend** | React 18, TypeScript, Vite, Vitest, Testing Library, plain CSS |
| **Backend** | Python 3, FastAPI, Uvicorn, Pydantic, SQLAlchemy |
| **Data** | PostgreSQL 16 |
| **Integrations** | [python-plexapi](https://github.com/pkkid/python-plexapi) (Plex Media Server), [SoCo](https://github.com/SoCo/SoCo) (Sonos), httpx (Plexamp companion API) |
| **API contract** | OpenAPI 3 (Swagger at `/docs`, `openapi.yaml` in repo) |
| **Runtime / ops** | Docker Compose, nginx (static UI + reverse proxy), multi-arch images on Docker Hub (`paulcatlin/plexamp-speed-dial-api`, `paulcatlin/plexamp-speed-dial-web`) |
| **Testing** | pytest, pytest-asyncio (backend); Vitest + jsdom (frontend) |

---

## Repository layout (high level)

- `frontend/` — React SPA, nginx image, PWA assets, Vite plugins
- `backend/` — FastAPI app, services (`plex_service`, `playback_service`, `sonos_service`, `plexamp_client`), DB models and migrations
- `docker-compose.yml` — Postgres, API, and web services for local or server deploy
- `openapi.yaml` — exported API specification
- `README.md` — setup, usage, troubleshooting, and API reference
