#!/usr/bin/env bash
# Copy Chore Fridge to an SSH-accessible host and rebuild its container.
# The remote data/ directory is not included and remains untouched.
#
# Copy .env.example to .env, fill in the deployment settings, then run:
#   ./deploy-nas.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

HOST="${NAS_HOST:-}"
REMOTE="${NAS_PATH:-}"
DOCKER_COMPOSE="${NAS_DOCKER_COMPOSE:-docker compose}"
BIND_ADDRESS="${CHORE_FRIDGE_BIND_ADDRESS:-}"

if [[ -z "$HOST" || -z "$REMOTE" || -z "$BIND_ADDRESS" ]]; then
  echo "Error: NAS_HOST, NAS_PATH, and CHORE_FRIDGE_BIND_ADDRESS are required." >&2
  echo "Copy .env.example to .env and fill in your deployment settings." >&2
  exit 2
fi

cd "$ROOT"

echo "Copying app to ${HOST}:${REMOTE} (leaving data/ untouched)"
tar --exclude=node_modules --exclude=dist -czf - \
  Dockerfile docker-compose.yml package.json package-lock.json \
  apps packages .dockerignore \
| ssh "$HOST" "cd '$REMOTE' && tar xzpf -"

echo "Configuring the private LAN bind address"
printf 'CHORE_FRIDGE_BIND_ADDRESS=%s\n' "$BIND_ADDRESS" \
| ssh "$HOST" "umask 077 && cat > '$REMOTE/.env'"

echo "Rebuilding container"
ssh "$HOST" "export PATH=/usr/local/bin:\$PATH; cd '$REMOTE' && $DOCKER_COMPOSE up --build -d"

echo "Checking container"
ssh "$HOST" "export PATH=/usr/local/bin:\$PATH; docker ps --filter name=chore-fridge --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
echo "Done. Open the service using the host's private LAN address."
