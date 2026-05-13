#!/usr/bin/env bash
# Build and push paulcatlin/plexamp-speed-dial-{api,web}:latest to Docker Hub (multi-arch).
# Prerequisites: docker login; Docker Desktop or buildx with QEMU for multi-platform.
# Optional: DOCKER_PLATFORMS=linux/amd64,linux/arm64 (default) — set to linux/amd64 for amd64-only.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORMS="${DOCKER_PLATFORMS:-linux/amd64,linux/arm64}"

api_image="paulcatlin/plexamp-speed-dial-api:latest"
web_image="paulcatlin/plexamp-speed-dial-web:latest"

cd "$ROOT"

echo "Building & pushing ${api_image} (platforms: ${PLATFORMS})"
docker buildx build \
  --platform "${PLATFORMS}" \
  -t "${api_image}" \
  --push \
  ./backend

echo "Building & pushing ${web_image} (platforms: ${PLATFORMS})"
docker buildx build \
  --platform "${PLATFORMS}" \
  -t "${web_image}" \
  --push \
  ./frontend

echo "Done."
