# Plexamp Sonos Speed Dial

Mobile-optimized web app to quickly play Plex music through Plexamp headless players and Sonos speaker targets, with one-tap speed-dial favorites.

## Tech Stack

- Backend: FastAPI + SQLAlchemy + PostgreSQL
- Frontend: React + Vite (mobile-first UI)
- Sonos: SoCo discovery
- Plex: Plex API integration layer (single-owner auth flow)
- Deployment: Docker Compose + optional [Docker Hub](https://hub.docker.com/) images (`plexamp-speed-dial-api`, `plexamp-speed-dial-web`)

## Features

- Browse and play by:
  - playlist
  - album
  - artist
  - track
  - random album from collection
- Select playback target:
  - multiple Sonos speakers via checkboxes
  - saved Sonos group presets
- Manage multiple Plexamp headless players
- Save one-tap speed-dial favorites and delete them
- Simple API-first backend with OpenAPI docs

## API Overview

Base path: `http://localhost:8000/api/v1`

- `GET /health`
- `POST /auth/plex/start`
- `GET /auth/plex/pin/{pin_id}` — poll OAuth PIN; saves the token when Plex approves the app
- `GET /auth/plex/server-test` — diagnostic: reachable URL?, token?, Music library sections
- `POST /auth/plex/complete` — optional developer override or one-shot PIN completion
- `GET /auth/plex/status`
- `GET /media/playlists` *(requires linked Plex token + Plex server URL in Setup)*
- `GET /media/artists`
- `GET /media/albums`
- `GET /media/tracks`
- `GET /media/collections`
- `GET /media/random-album?collection_id=...`
- `GET /sonos/speakers`
- `GET|POST|DELETE /sonos/group-presets`
- `GET|POST|DELETE /players`
- `POST /play`
- `POST /plexamp/skip-next` · `POST /plexamp/skip-previous` · `POST /plexamp/pause` · `POST /plexamp/resume`
- `POST /sonos/stop` · `POST /sonos/play-line-in`
- `GET|POST|DELETE /speed-dial`

### Play request example

```bash
curl -X POST http://localhost:8000/api/v1/play \
  -H "Content-Type: application/json" \
  -d '{
    "media_type": "album",
    "media_id": "album-1",
    "player_id": 1,
    "speaker_ids": ["living-room", "kitchen"],
    "preset_id": null
  }'
```

## OpenAPI

- Swagger UI: `http://localhost:8000/docs`
- JSON spec: `http://localhost:8000/openapi.json`
- Versioned repo spec: [`openapi.yaml`](openapi.yaml)

Regenerate `openapi.yaml`:

```bash
source .venv/bin/activate
python backend/export_openapi.py
```

## Local Development

### Prerequisites

- Docker + Docker Compose
- Local network access to:
  - Plex server
  - Sonos speakers
  - Plexamp headless players

### Configuration

The UI calls the API at **`/api/v1`** on the same origin: in Docker, [`frontend/nginx.conf`](frontend/nginx.conf) proxies `/api` to the `api` service; with **`npm run dev`**, Vite proxies `/api` to **`http://127.0.0.1:8000`**. You can change the **published** ports in [`docker-compose.yml`](docker-compose.yml) (for example `8080:80` for the web service) without changing the app — keep the API service reachable as hostname `api` on port 8000 inside Compose. If you run uvicorn on a **non-8000** port locally, adjust the `server.proxy` target in [`frontend/vite.config.ts`](frontend/vite.config.ts).

**Docker Compose** uses fixed Postgres credentials and `DATABASE_URL` in [`docker-compose.yml`](docker-compose.yml) (database is not exposed on the host). **Setup** stores Plex server URL, TLS, Sonos options, and line-in in the database. On first API startup, a **Plex client UUID** is generated and stored in the same table so Plex sees a stable device identity (no `PLEX_CLIENT_*` env vars). The API still defaults **`CORS_ORIGINS=*`** in code ([`backend/app/core/config.py`](backend/app/core/config.py)); override with a root `.env` only if you need a stricter allowlist.

After you sign in with Plex, media routes use [python-plexapi](https://github.com/pkkid/python-plexapi) against the server URL from Setup with your stored owner token.

### Run with Docker Compose (pull pre-built images)

[`docker-compose.yml`](docker-compose.yml) pulls **`paulcatlin/plexamp-speed-dial-api:latest`** and **`paulcatlin/plexamp-speed-dial-web:latest`**. On a new machine, copy the repo (or at least `docker-compose.yml`), then:

```bash
docker compose pull
docker compose up -d
```

### Build and push images (Docker Hub)

1. On [Docker Hub](https://hub.docker.com/), create repositories **`plexamp-speed-dial-api`** and **`plexamp-speed-dial-web`** under the **paulcatlin** account (if they do not exist yet).
2. `docker login`
3. From the repo root:

```bash
./scripts/docker-build-push.sh
```

The script uses **`docker buildx`** and publishes **`linux/amd64` and `linux/arm64`** by default so `docker compose pull` works on Apple Silicon and typical Linux servers. For amd64-only images (smaller, but arm64 Macs cannot pull natively): `DOCKER_PLATFORMS=linux/amd64 ./scripts/docker-build-push.sh`.

If you already have **amd64-only** images on Hub and cannot republish yet, force emulation on an arm64 Mac by adding under `api` and `web` in compose: `platform: linux/amd64` (slower startup).

### Run from local source (build instead of pull)

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

Services:

- Web UI (and browser calls to **`/api/v1`**, proxied to the API): `http://localhost:3000`
- API directly (OpenAPI, curl): `http://localhost:8000`

Postgres runs only on the Compose network (user `plexamp`, database `plexamp_speed_dial`; see `docker-compose.yml`). To open a shell: `docker compose exec db psql -U plexamp -d plexamp_speed_dial`.

## Manual Setup (without Docker)

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m app.db.init_db
uvicorn app.main:app --app-dir backend --reload
```

Open **Setup** in the UI and set the Plex Media Server base URL (and Sonos options as needed).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Usage Flow

1. Open **Setup** and set the Plex Media Server base URL (reachable from the API host; from Docker to a Mac/Windows host, `http://host.docker.internal:32400` is a common choice)
2. Connect Plex (browser OAuth; the UI polls until the token is stored)
3. Add one or more Plexamp players
4. Choose media tab and media item (or random album from a collection)
5. Select Sonos speaker checkboxes
6. Click **Play now**
7. Click **Add to speed dial** for one-tap reuse
8. Use speed-dial buttons to replay or delete favorites

## Tests

Backend:

```bash
source .venv/bin/activate
cd backend
pytest
```

Frontend:

```bash
cd frontend
npm test
```

## End-to-End Validation Checklist

- [ ] Plex auth status transitions from disconnected to connected
- [ ] Media lists load for playlist/album/artist/track
- [ ] Random album endpoint returns playable album payload
- [ ] Sonos speakers are listed
- [ ] Plexamp player can be created and selected
- [ ] `POST /play` returns success with selected targets
- [ ] Speed dial create/list/delete works end-to-end

## Notes / troubleshooting

- **`no matching manifest for linux/arm64` on `docker compose pull`:** the Hub images were built for **amd64 only**. Re-publish with [`scripts/docker-build-push.sh`](scripts/docker-build-push.sh) (defaults to **amd64 + arm64**). Until then, add `platform: linux/amd64` under `api` and `web`, or build locally with `docker-compose.build.yml`.
- **Postgres `FATAL: role "plexamp" does not exist`:** the named volume was created earlier with different credentials. Postgres only applies `POSTGRES_USER` on first init. Stop the stack and remove the DB volume, then start again (this wipes local Docker DB data): `docker compose down -v` then `docker compose pull && docker compose up` (or add `-f docker-compose.build.yml` and `up --build` if you build images locally). If you need to keep other volumes, use `docker volume ls` to find this project’s `*_postgres_data` volume, remove it with `docker volume rm …`, then start the stack again.
- **Nginx `502` / “Host is unreachable” to the API:** usually the `api` container never came up or exited (often because the API could not connect to Postgres). Fix the database issue above first; then confirm `docker compose ps` shows `api` running.
- If the UI shows “connected” but artists/albums are empty or errors occur, the **Plex URL in Setup** must be reachable from where the API runs (Docker cannot use `localhost` to mean your Mac unless you use `host.docker.internal` or the LAN IP).
- Use **Connect Plex**, then **`Test Plex server (API)`** in the UI: it confirms TCP/TLS connectivity, token acceptance, and lists **Music** library section names Plex returned (not TIDAL-only views).
- If you get **401** from Plex, ensure **Settings → Network → List of IP addresses allowed without auth** covers the subnet of the Docker host/API (or Plex will reject APIs that do not behave like a LAN client session).
- For **HTTPS** to Plex with a self-signed certificate, try plain **`http://...:32400`**, or turn off **Verify HTTPS certificates** in Setup (trusted LAN only).
- Media lists require at least one **Music** library on the Plex server that your account can read.
- **Sonos in Docker:** discovery uses SSDP multicast, which usually **does not cross Docker’s default bridge**. Enter **seed IPs** under Setup (comma-separated LAN IPs of any Sonos player). On **Linux** you can alternatively run the API with **`network_mode: host`** (not supported the same way on Docker Desktop for Mac).
- **Demo fallback** for Sonos (fake players) is available only as a checkbox under Setup for UI testing.
