# Plexamp Sonos Speed Dial

Mobile-optimized web app to quickly play Plex music through Plexamp headless players and Sonos speaker targets, with one-tap speed-dial favorites.

## Tech Stack

- Backend: FastAPI + SQLAlchemy + PostgreSQL
- Frontend: React + Vite (mobile-first UI)
- Sonos: SoCo discovery
- Plex: Plex API integration layer (single-owner auth flow)
- Deployment: Docker Compose

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
- `GET /media/playlists` *(requires linked Plex token + `PLEX_SERVER_URL`)*
- `GET /media/artists`
- `GET /media/albums`
- `GET /media/tracks`
- `GET /media/collections`
- `GET /media/random-album?collection_id=...`
- `GET /sonos/speakers`
- `GET|POST|DELETE /sonos/group-presets`
- `GET|POST|DELETE /players`
- `POST /play`
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

### Environment

```bash
cp .env.example .env
```

Set **`PLEX_SERVER_URL`** on the **API** to the Plex Media Server HTTP base (for example `http://192.168.1.42:32400` or `http://127.0.0.1:32400` when API and Plex share a host). The API must be able to reach that host: from Docker on macOS/Windows, `http://host.docker.internal:32400` often works if Plex runs on the machine. **`PLEX_SERVER_URL` is loaded from `./.env` at the repo root or `backend/.env`**, so it still works when you start uvicorn with cwd `backend/`.

After you sign in with Plex, media routes use [python-plexapi](https://github.com/pkkid/python-plexapi) against that server with your stored owner token.

### Run with Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- API: `http://localhost:8000`
- Postgres: `localhost:5432`

## Manual Setup (without Docker)

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
export PLEX_SERVER_URL='http://YOUR_PMS_IP:32400'  # or add to .env in project root
python -m app.db.init_db
uvicorn app.main:app --app-dir backend --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Usage Flow

1. Set `PLEX_SERVER_URL` for the API container
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

- If the UI shows “connected” but artists/albums are empty or errors occur, **`PLEX_SERVER_URL` must point at Plex from where the API runs** (Docker cannot use `localhost` to mean your Mac unless you use `host.docker.internal` or the LAN IP).
- Use **Connect Plex**, then **`Test Plex server (API)`** in the UI: it confirms TCP/TLS connectivity, token acceptance, and lists **Music** library section names Plex returned (not TIDAL-only views).
- If you get **401** from Plex, ensure **Settings → Network → List of IP addresses allowed without auth** covers the subnet of the Docker host/API (or Plex will reject APIs that do not behave like a LAN client session).
- For **HTTPS** to Plex with a self-signed certificate, try plain **`http://...:32400`**, or set **`PLEX_SSL_VERIFY=false`** on the backend (trusted LAN only).
- Media lists require at least one **Music** library on the Plex server that your account can read.
- **Sonos in Docker:** discovery uses SSDP multicast, which usually **does not cross Docker’s default bridge**. Set **`SONOS_SEED_IPS`** to the LAN IP of **one** Sonos speaker; the API opens TCP to that device and lists **all players** in the household via `visible_zones`. On **Linux** you can alternatively run the API with **`network_mode: host`** (not supported the same way on Docker Desktop for Mac).
- Optional **`SONOS_DEMO_FALLBACK=true`** restores fake “Living Room / Kitchen” entries for UI testing only.
