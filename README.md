# Chore Fridge

Chore Fridge is a self-hosted household chore board designed for a smart fridge or wall-mounted tablet. It provides large tap targets, separate kid columns, recurring chores, rewards, stars, and a parent PIN.

The UI is written in [JSOX](https://github.com/javascript-ox/jsox) and compiled to ordinary JavaScript. Browsers only receive the compiled application.

## Run locally

Requirements:

- Node.js 22 or later
- Python 3.12 or later, or Docker

For development, run the state server and Vite in separate terminals:

```bash
npm install
npm run build
python3 server.py
```

```bash
npm run dev
```

Open `http://localhost:5173`. Vite proxies API requests to the state server on port 8080.

For a production-style local deployment:

```bash
docker compose up --build -d
```

Open `http://localhost:8080`. The provided Compose configuration binds to localhost by default, so other devices cannot connect.

To make the board available to a fridge or tablet on the same trusted network, bind it explicitly to the host computer's private LAN address:

```bash
CHORE_FRIDGE_BIND_ADDRESS=192.168.1.20 docker compose up --build -d
```

Replace the example address with the host's actual private address, then open `http://HOST-PRIVATE-ADDRESS:8080` on the household device.

Application data is stored in `data/state.json`. This directory is excluded from Git because it can contain household names, chores, completion history, rewards, and the parent PIN. Back it up separately and never commit it.

## Security and network access

> [!WARNING]
> Chore Fridge is intended for a trusted home network only. Do not expose it directly to the public internet.

The built-in server has no user authentication, transport encryption, rate limiting, or authorization on its state API. Any device that can reach the service can read or replace the complete board state, including the parent PIN. The PIN is only a convenience lock within the interface; it is not a security boundary.

To keep the service local:

- Do not configure router port forwarding, UPnP forwarding, a public reverse proxy, or a public tunnel for port 8080.
- Keep the host firewall enabled and allow port 8080 only from your trusted private subnet or specific household devices.
- Put untrusted guests and IoT devices on a separate guest or VLAN network that cannot reach the host.
- Keep the Compose file's default localhost binding when only the host itself needs access. If household devices need access, set `CHORE_FRIDGE_BIND_ADDRESS` to one specific private LAN address rather than `0.0.0.0`.
- Verify from outside your home network that the service is unreachable. Do not rely on the parent PIN to protect it.

If remote access is required, place the application behind a maintained access layer that provides HTTPS and strong authentication, such as an authenticated VPN. Authentication should be added to the application itself before treating an internet-facing deployment as supported.

## Deploy to a NAS

The included script copies the application to an SSH-accessible NAS and rebuilds its Docker container. Supply your own SSH destination and remote path; the repository contains no machine-specific defaults.

```bash
NAS_HOST=user@nas.local \
NAS_PATH=/path/to/chore-fridge \
./deploy-nas.sh
```

The script leaves the remote `data/` directory untouched. You may also set `NAS_DOCKER_COMPOSE` if Docker Compose has a nonstandard location on the NAS:

```bash
NAS_HOST=user@nas.local \
NAS_PATH=/path/to/chore-fridge \
NAS_DOCKER_COMPOSE="docker compose" \
./deploy-nas.sh
```

SSH credentials and agent configuration are deliberately left to the user. Do not add keys, tokens, local socket paths, hostnames, or household data to this repository.

## Put it on a fridge or tablet

- **Samsung Family Hub:** Open the Internet app, enter the local URL, bookmark it, and pin it to a board.
- **iPad or Android tablet:** Open the local URL and choose Add to Home Screen. Guided Access or app pinning can keep the device in the app.
- **Other smart-fridge browsers:** Open and bookmark the service's local URL.

The Docker/Python server lets all devices on the permitted local network share one board. Without the state server, the application falls back to browser storage and each device has its own independent data.

## Build

```bash
npm run build
```

The generated `dist/` directory is excluded from Git.

## Contributing

Issues and pull requests are welcome. Please do not include real household data, credentials, private hostnames, local filesystem paths, or public endpoints in examples or bug reports.

## License

No license has been selected yet. Until one is added, the source is available for inspection, but normal copyright restrictions apply.
