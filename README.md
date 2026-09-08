# Chore Fridge

Chore Fridge is a self-hosted household chore board designed for a smart fridge or wall-mounted tablet. It provides large tap targets, separate kid columns, recurring chores, rewards, stars, and a parent PIN.

The UI is written in [JSOX 0.2](https://github.com/javascript-ox/jsox) and compiled to ordinary JavaScript. Native web components use `@js-ox/web-components` with light DOM so the existing themes apply throughout the app. Browsers only receive the compiled application.

## Run locally

Requirements:

- Node.js 22.13 or later, or Docker
- Python 3 for the legacy compatibility test only

For development, run the state server and Vite in separate terminals:

```bash
npm install
npm run build
npm start
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

Application data is stored in `data/chore-fridge.sqlite`. Existing `data/state.json` files migrate automatically on first startup (see below). This directory is excluded from Git because it can contain household names, chores, completion history, rewards, and the parent PIN. Back it up separately and never commit it.

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

The Node server lets all devices on the permitted local network share one board. Without the state server, the application falls back to browser storage and each device has its own independent data.

## Parent controls

Use **Unlock Parent Mode** to enter the PIN and unlock this page. Unlocking keeps you on the board. Open **Settings** separately, and use **Lock Parent Mode** when finished. Reloading starts locked, and a PIN change relocks other open pages when synchronized. Without a PIN, unlocking takes effect immediately.

In **Settings → General**, enable **Require Parent Mode** to block completion, undo, and count changes while locked. A blocked tap displays “Unlock Parent Mode to change task completion.” The matching **Reward permissions** toggle requires Parent Mode for redemptions and displays “Unlock Parent Mode to redeem rewards.” Task and reward restrictions are independent and default to off. Both preferences are shared across household devices; the unlocked state is local to each page. This remains a browser interface control, not server authentication.

The Parent PIN and destructive household reset controls also live in **Settings → General**. The Display tab contains only the same device-local appearance, theme, and zoom controls available from **View**.

## Display options

Use **View** from setup or the board, or open **Settings → Display**, to adjust this device's display:

- Appearance: Light, Dark, or System (follows the device's color preference).
- Theme: Classic (V1), Business, Crayon, High contrast, Lego, or Cyberpunk.
- Zoom: 50–150% in 10% steps.

Changes apply immediately and are remembered in this browser. Display preferences are independent of the shared household state, so each fridge, tablet, or computer can use its own settings. Existing explicit bright/dim preferences are migrated from browser storage; automatic appearance now follows the system instead of dimming after 8 p.m.

## Build and checks

```bash
npm run build
```

The generated `apps/web/dist/` directory is excluded from Git.

Run component and server integration tests with `npm test`. These compile the actual JSOX modules and exercise household flows in an isolated DOM and against the Node server and a Python compatibility fixture with temporary test data, without accessing household data. GitHub Actions runs a clean dependency install, component tests, production build, and a container build for pull requests and pushes to `main`.

## Frontend structure

- `apps/web/src/app.jsox`: the `<chore-fridge>` element subscribes to screen selection and owns synchronization connections and timers. Disconnecting it cleans up its subscription and timers.
- `apps/web/src/views/`: setup, board, PIN, and parent screen components, plus task forms and view controls.
- `apps/web/src/components/`: reusable choice groups, kid/chore components, and keyed list updates that preserve element identity.
- `apps/web/src/stores/family.js`: independent family-name, PIN, setup-completion, and kid stores.
- `apps/web/src/stores/chores.js`: chore definitions, completion/count stores, scheduling rules, and task actions.
- `apps/web/src/stores/rewards.js` and `balances.js`: rewards, spending, and computed star/gold balances.
- `apps/web/src/stores/navigation.js`, `setup.js`, and `clock.js`: local navigation, onboarding, and date updates.
- `apps/web/src/stores/sync.js`: assembles the existing household JSON for local storage and the server, and applies incoming snapshots to the affected stores.
- `packages/domain/src/`: shared scheduling, balances, command rules, date, record, and history helpers.
- `apps/web/src/view.js`: a separate Nano Store for browser-local appearance and zoom preferences.

JSOX constructs and manipulates DOM directly. There is no paint/render cycle, virtual DOM, or app-wide refresh bus. Components build their controls on first connection and use store subscriptions to synchronize existing nodes. The `defineScreen` helper preserves those controls across reconnections and removes subscriptions on disconnect. Parent tabs retain their DOM, and keyed lists retain item controls while records change.

Nano Stores owns independent domain snapshots. Read the relevant store with `.get()` and change it through actions such as `saveKid`, `saveChore`, `redeemReward`, `setUI`, and `setSetup`. Actions replace only the affected collection or record, preserving unrelated references. A batched action revision notifies persistence after the changes finish. The sync adapter alone assembles the full document required by the existing server; incoming snapshots update only changed domains without scheduling an echo save. UI and display changes never enter the shared household payload. There is no aggregate household store or whole-document clone on local actions.

The direct-DOM convention is also recorded in `AGENTS.md` for future changes.

Shared boards receive server-sent revision events through `/api/events` and fetch `/api/board` for the browser’s current calendar day. Command responses are compact receipts. Past records, task versions, archives, and the journal are not included in normal board requests. A five-second poll also retries after network failures. Disconnecting the app closes the event stream and timers. The browser queues individual commands in local storage, reuses command IDs on retries, and reconciles optimistic changes with the server after the queue drains. Rejected changes show a message. RxJS is not needed for this flow.

## Workspace and API

- `apps/web`: JSOX components and independent Nano Stores.
- `apps/server`: Fastify HTTP API, SSE, transactional SQLite persistence, and startup migration.
- `packages/domain`: pure household rules shared by browser and server.
- `packages/contracts`: JSON schemas for commands and legacy snapshots.

The server owns command validation, completion/count changes, and reward spending. Command receipts and state commit in one SQLite transaction, so retrying the same request ID cannot spend credits twice. MCP can later call the same domain/application service; an MCP adapter is not implemented yet.

See [API documentation](docs/api.md) for command examples and compatibility behavior.

## Task versions and history

Tasks have a permanent `taskId` (also exposed as legacy `id`) and a `versionId` identifying immutable rules. Editing creates a version; archiving removes the task from the current board while preserving versions and earned credit. Parent task settings include an archived list with Restore, which creates another version under the same task ID.

The append-only SQLite ledger records credits, linked undo reversals, and spending debits. SQLite prevents journal rows from being updated or deleted. Entries reference the task and version and retain the points/gold earned at completion. A change from two to three stars does not revalue earlier work. Counted tasks can contain units earned under different versions; undo appends negative entries against the most recent units first. Current allocations are a derived projection, not the journal itself. Clients send the version they saw with completion commands, including delayed/offline submissions; archived tasks reject new completions.

Each committed action also stores an immutable household snapshot in SQLite in the same transaction. The history API exposes those revisions for time travel; a date-browsing interface is still on the roadmap. Historical snapshots include prior spending, corrections, and archived definitions. Erasing the current board resets its state but does not purge recorded history.

Existing JSON and older SQLite households automatically gain baseline versions and opening journal entries. Schema-2 credit allocations and cumulative spending migrate once into opening credits/debits without revaluing earned points. Their known balances are preserved. Transactional balance totals and small daily projections let the board work without fetching or summing the journal. Detailed ledger reads are day-filtered and paginated. Full historical snapshots start at the upgrade: old task definitions and actions that were never recorded cannot be recovered. Legacy writes also pass through versioning on the Node server, but old browsers may still display balances using their old calculations until refreshed/upgraded. The Python compatibility fallback does not implement this history foundation.

## Automatic migration

The next container upgrade keeps the same `./data:/data` volume. On first Node startup:

1. Read and validate `DATA_FILE` (default `/data/state.json` in Docker, `data/state.json` locally).
2. Copy valid legacy data to `state.json.pre-node-<content-hash>.bak`, leaving the source unchanged.
3. Import the household and record the completed migration in one SQLite transaction.
4. Use `DATABASE_FILE` (default `chore-fridge.sqlite` beside the JSON file) for all subsequent writes.

Family details, PIN, tasks, rewards, completion tombstones, numeric/count history, spending, and unknown legacy fields are preserved. Invalid JSON or an unsupported data version stops startup with an error; it does not replace the household with an empty board. Repair the source and restart to retry. A completed migration never imports the old JSON again, even if that file changes. New installations start empty; browser-only households can import once through `/api/import`, which refuses to overwrite an existing household.

Keep a backup of the data directory before upgrading. For later backups, stop the container and copy the whole data directory so SQLite and its WAL files remain consistent. The original JSON backup represents the upgrade moment only; reverting to Python would lose subsequent Node changes unless those changes are exported first. Restoring an old JSON file beside an existing database does not restore the active household.

`LEGACY_STATE_WRITES=false` disables the compatibility `PUT /api/state` endpoint once every device uses the new client. It is enabled by default for a gradual upgrade. Legacy whole-state writes retain their old merge behavior and can overwrite edits to other fields; they do not provide the command API's concurrency guarantees. Neither mode supplies authentication yet.

## Contributing

See [the changelog](CHANGELOG.md) for user-facing changes and upgrade notes.

Issues and pull requests are welcome. Please do not include real household data, credentials, private hostnames, local filesystem paths, or public endpoints in examples or bug reports.

## License

No license has been selected yet. Until one is added, the source is available for inspection, but normal copyright restrictions apply.
