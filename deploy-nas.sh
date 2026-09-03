#!/usr/bin/env bash
# Copy Chore Fridge to an SSH-accessible host and rebuild its container.
# The remote data/ directory is not included and remains untouched.
#
# Required:
#   NAS_HOST=user@nas.local NAS_PATH=/path/to/chore-fridge ./deploy-nas.sh
#
# Optional:
#   NAS_DOCKER_COMPOSE="docker compose"

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST="${NAS_HOST:-}"
REMOTE="${NAS_PATH:-}"
DOCKER_COMPOSE="${NAS_DOCKER_COMPOSE:-docker compose}"

if [[ -z "$HOST" || -z "$REMOTE" ]]; then
  echo "Error: NAS_HOST and NAS_PATH are required." >&2
  echo "Example: NAS_HOST=user@nas.local NAS_PATH=/path/to/chore-fridge ./deploy-nas.sh" >&2
  exit 2
fi

cd "$ROOT"

echo "Copying app to ${HOST}:${REMOTE} (leaving data/ untouched)"
tar czf - \
  Dockerfile docker-compose.yml server.py package.json package-lock.json \
  index.html vite.config.js src public .dockerignore \
| ssh "$HOST" "cd '$REMOTE' && tar xzpf -"

echo "Rebuilding container"
ssh "$HOST" "cd '$REMOTE' && $DOCKER_COMPOSE up --build -d"

echo "Checking container"
ssh "$HOST" "docker ps --filter name=chore-fridge --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
echo "Done. Open the service using the host's private LAN address."
