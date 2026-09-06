# Chore Fridge

Chore Fridge is a self-hosted household chore board designed for a smart fridge or wall-mounted tablet. It provides large tap targets, separate kid columns, recurring chores, rewards, stars, and a parent PIN.

The UI is written in [JSOX 0.2](https://github.com/javascript-ox/jsox) and compiled to ordinary JavaScript. Native web components use `@js-ox/web-components` with light DOM so the existing themes apply throughout the app. Browsers only receive the compiled application.

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

The included script copies the application to an SSH-accessible NAS and rebuilds its Docker container. Copy the example configuration once and fill in your own values:

```bash
cp .env.example .env
```

The local `.env` is ignored by Git. It holds the SSH destination, remote application path, Docker Compose command, and the NAS's private LAN bind address. It should look like this with values appropriate for your network:

```dotenv
NAS_HOST=user@nas.local
NAS_PATH=/path/to/chore-fridge
NAS_DOCKER_COMPOSE="docker compose"
CHORE_FRIDGE_BIND_ADDRESS=192.168.1.20
```

Deploy with:

```bash
./deploy-nas.sh
```

The script writes only `CHORE_FRIDGE_BIND_ADDRESS` to the remote `.env`; private SSH destination details remain on the deploying computer. It leaves the remote `data/` directory untouched. SSH credentials and agent configuration are deliberately left to the user. Do not add keys, tokens, local socket paths, hostnames, or household data to tracked files.

## Put it on a fridge or tablet

- **Samsung Family Hub:** Open the Internet app, enter the local URL, bookmark it, and pin it to a board.
- **iPad or Android tablet:** Open the local URL and choose Add to Home Screen. Guided Access or app pinning can keep the device in the app.
- **Other smart-fridge browsers:** Open and bookmark the service's local URL.

The Docker/Python server lets all devices on the permitted local network share one board. Without the state server, the application falls back to browser storage and each device has its own independent data.

## Display options

Use **View** from setup, the board, the parent lock, or parent settings to adjust this device's display:

- Appearance: Light, Dark, or System (follows the device's color preference).
- Theme: Classic, Business, Crayon, High contrast, Lego, or Cyberpunk.
- Zoom: 50–150% in 10% steps.

Changes apply immediately and are remembered in this browser. Display preferences are independent of the shared household state, so each fridge, tablet, or computer can use its own settings. Existing explicit bright/dim preferences are migrated from browser storage; automatic appearance now follows the system instead of dimming after 8 p.m.

## Build and checks

```bash
npm run build
```

The generated `dist/` directory is excluded from Git.

Run component and server integration tests with `npm test`. These compile the actual JSOX modules and exercise household flows in an isolated DOM and against the existing Python server with temporary test data, without accessing household data. GitHub Actions runs a clean dependency install, component tests, production build, and Python syntax check for pull requests and pushes to `main`.

## Frontend structure

- `src/app.jsox`: the `<chore-fridge>` element subscribes to screen selection and owns polling timers. Disconnecting it cleans up its subscription and timers.
- `src/views/`: setup, board, PIN, and parent screen components, plus task forms and view controls.
- `src/components/`: reusable choice groups, kid/chore components, and keyed list updates that preserve element identity.
- `src/stores/family.js`: independent family-name, PIN, setup-completion, and kid stores.
- `src/stores/chores.js`: chore definitions, completion/count stores, scheduling rules, and task actions.
- `src/stores/rewards.js` and `balances.js`: rewards, spending, and computed star/gold balances.
- `src/stores/navigation.js`, `setup.js`, and `clock.js`: local navigation, onboarding, and date updates.
- `src/stores/sync.js`: assembles the existing household JSON for local storage and the server, and applies incoming snapshots to the affected stores.
- `src/domain/`: shared date, record, and history-merge helpers.
- `src/view.js`: a separate Nano Store for browser-local appearance and zoom preferences.

JSOX constructs and manipulates DOM directly. There is no paint/render cycle, virtual DOM, or app-wide refresh bus. Components build their controls on first connection and use store subscriptions to synchronize existing nodes. The `defineScreen` helper preserves those controls across reconnections and removes subscriptions on disconnect. Parent tabs retain their DOM, and keyed lists retain item controls while records change.

Nano Stores owns independent domain snapshots. Read the relevant store with `.get()` and change it through actions such as `saveKid`, `saveChore`, `redeemReward`, `setUI`, and `setSetup`. Actions replace only the affected collection or record, preserving unrelated references. A batched action revision notifies persistence after the changes finish. The sync adapter alone assembles the full document required by the existing server; incoming snapshots update only changed domains without scheduling an echo save. UI and display changes never enter the shared household payload. There is no aggregate household store or whole-document clone on local actions.

The direct-DOM convention is also recorded in `AGENTS.md` for future changes.

Shared boards currently poll `/api/state` every five seconds while the board is open and server connectivity has been established. This rewrite preserves that protocol; server-sent events and RxJS are not implemented.

## Contributing

Issues and pull requests are welcome. Please do not include real household data, credentials, private hostnames, local filesystem paths, or public endpoints in examples or bug reports.

## License

No license has been selected yet. Until one is added, the source is available for inspection, but normal copyright restrictions apply.
