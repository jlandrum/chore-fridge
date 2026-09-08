# Household API

This is a single-household, trusted-LAN API. No authentication or authorization is implemented. A kid ID attributes activity; it does not prove identity. Parent PIN checks remain a UI convenience.

## Commands

Send `POST /api/commands` with `Content-Type: application/json`:

```json
{
  "id": "unique-request-id",
  "type": "chore.complete",
  "payload": { "choreId": "task-id", "kidId": "kid-id", "day": "2026-09-06" }
}
```

The response is a compact receipt containing a monotonically increasing `revision`, `result`, and `replayed`. It does not contain household state; fetch `/api/board` after pending commands finish. Persist and reuse the same ID and request body when retrying a request whose response was lost. IDs remain recorded across restarts. Reusing an ID for another request returns 409. Schemas reject malformed commands with 400; domain conflicts (including insufficient credit) return 409 without changing state. Dates identify the household calendar day supplied by the client; they are validated as real dates, not restricted to today.

Supported commands:

| Type | Payload |
| --- | --- |
| `setup.finish` | `familyName`, nonempty `kids` array, `pin` |
| `kid.save` | `id`, `name`; optional `emoji`, `color` |
| `kid.remove` | `id` |
| `chore.save` | `id`, `title`, nonempty `kidIds`; optional `emoji`, `points`, `repeat`, `minCount`, `maxCount`, `gold` |
| `chore.remove` | `id` (archive) |
| `chore.restore` | `id` (restore under the same permanent ID) |
| `chore.complete`, `chore.undo` | `choreId`, `kidId`, `day`; optional `versionId` |
| `chore.count` | `choreId`, `kidId`, `day`, `delta` (1 or -1); optional `versionId` |
| `reward.save` | `id`, `title`, `cost`; optional `emoji`, `gold` |
| `reward.remove` | `id` |
| `reward.redeem` | `rewardId`, `kidId`; optional calendar `day` |
| `settings.update` | One or more of: `familyName`, `requireParentModeForCompletion`, `requireParentModeForRedemptions` |
| `pin.set` | `pin` (empty or four digits) |
| `household.reset` | empty object |

`repeat` is `daily`, `weekly`, or `once`. Defaults and exact validation live in `packages/contracts/src/api.js` and `packages/domain/src/commands.js`. Whole-household reset is destructive and is exposed for the existing erase-board action.

## Reads and live updates

- `GET /api/board?day=YYYY-MM-DD`: the day-scoped board, or `null` before setup/import. The client sends its local calendar day; omission uses the server’s current day.
- `GET /api/state`: full version-1 household document for legacy compatibility/export. The modern board never requests it.
- `GET /api/kids`, `/api/chores`, `/api/rewards`: resource arrays.
- `GET /api/balances`: star and gold balances keyed by kid ID.
- `GET /api/capabilities`: command, event, and compatibility availability.
- `GET /api/events`: SSE stream; initial/current and subsequent messages carry `{ "revision": 1 }`. Fetch the current day’s board after a message. Reconnecting receives the current revision; this is not an event-history API.

## Compatibility and import

`PUT /api/state` retains the original 204 response and completion/count merge semantics. Set `LEGACY_STATE_WRITES=false` to return 410 for this endpoint after upgrading all clients. New clients use commands; when connected to the old Python server they fall back to its state protocol. Legacy writes are intentionally a transition path and can bypass command rules.

`POST /api/import` accepts a version-1 household document only when the database has no household. It atomically rejects subsequent imports with 409. This supports existing browser-only boards; disk JSON migration happens automatically at startup instead. The response contains only `revision`. Day-scoped views are rejected by both import and legacy PUT so a partial cache cannot replace the household.

For server-side reuse, `storage.command(command)` performs validation, transactional persistence, idempotency, and change notification. Future MCP tools should use this entry point. `applyCommand` in the shared domain package is pure and performs no I/O.

## Versions and time travel

`id` and `taskId` identify the same permanent task. `versionId` identifies immutable rules; `validFrom` records when that version was committed. Archive and restore create new versions. Send the version seen by the client with completion/count commands to preserve its credit value when an edit happens before synchronization. Omitting it uses the active version. Unknown versions and completions of archived tasks return 409.

- `GET /api/chores/archived`: archived tasks available for restoration.
- `GET /api/chores/:id/versions`: all recorded task versions, including archival versions.
- `GET /api/history`: up to 100 revision summaries, newest first. Use `?before=<oldest-revision>` for the next page.
- `GET /api/history/:revision`: immutable `{revision, recordedAt, action, state}` snapshot; missing revisions return 404.

`state.creditProjection` is a derived collection of active credit allocations by completion key. The SQLite ledger is the append-only accounting journal: undo inserts a negative row linked to the original credit, redo inserts a new credit, and reward spending inserts a debit. Original rows cannot be updated or deleted (enforced by SQLite triggers). Counts can reverse individual allocations from different task versions. `creditLedger` is retained only as a deprecated projection alias on the legacy full-state endpoint. Snapshot revisions are ordered by commit and include every accepted command, import, and legacy write. Retried commands do not create duplicate history entries.

Historical data starts with a migration baseline, not invented past edits. The outer household schema remains version 1 for older clients; `historyVersion: 1` identifies the added domain history fields, and SQLite schema version 3 adds the journal and transactional balance totals alongside durable revision snapshots. History fields are server-owned: legacy PUT requests cannot replace them. No history purge endpoint is implemented.

## Daily payloads and append-only credits

The daily board contains active household configuration, current-day completion/count records, and compact carried status for weekly and one-off tasks. It omits archived task definitions, task-version history, old completion/count records, spending history, and journal entries. Archived tasks are fetched separately when parent task settings open.

`creditProjection` in this response contains only the allocations relevant to the displayed status. `balanceCarry` contains signed all-time balance totals less those displayed allocations, allowing optimistic completion/undo and redemption without downloading the journal. The final displayed balance is clamped to zero; a negative underlying balance still offsets future earnings. Carried weekly/one-off status is represented under the selected day’s keys, not as old activity records. The daily endpoint is a view of current state for a calendar day, not a reconstruction of household configuration at a past timestamp; historical snapshots remain an explicit separate API.

`GET /api/ledger?day=YYYY-MM-DD&after=<sequence>` returns `{day, entries, next}`. It defaults to the current server day and returns at most 100 entries; use `next` as `after` to continue that same day. Entries include immutable `id`, task/version references, signed `units`, `stars`, `gold`, and `reverses` for undo. The command’s calendar day is the effective accounting day; `recordedAt` separately records when the server received it. No unbounded journal endpoint is exposed.

Existing balances migrate once as opening credits and opening spending debits. Known dated credit allocations retain their day; cumulative spending has no recoverable original dates and is recorded on the migration day. Historical undo events that were never journaled are not invented. Balance totals, journal entries, current projections, revision snapshots, and command receipts commit atomically. Reset keeps journal rows and appends offsetting adjustments to bring the current household to zero.

The normal board payload does not grow with the number of past journal entries or task versions. Server-side household snapshots and the explicit legacy/export and revision-history APIs still contain full historical projections; this change bounds regular network responses, not every internal storage operation.

The shared `requireParentModeForCompletion` preference defaults to false and is included in daily board responses. When enabled, the browser blocks completion, undo, and count changes until its local Parent Mode is unlocked and displays a message. This setting does not introduce API authentication or server-side parent sessions.

`requireParentModeForRedemptions` independently gates browser reward redemption while Parent Mode is locked, for both stars and gold. It defaults to false and is included in daily responses. `settings.update` is a partial update: omitted fields are preserved and an empty payload is rejected. It also accepts `familyName`; names are trimmed and blank names are rejected. The redemption gate is checked before opening the reward picker and again before spending so a lock change cannot allow a stale dialog to redeem.
