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

The response contains `state`, a monotonically increasing `revision`, `result`, and `replayed`. Persist and reuse the same ID and request body when retrying a request whose response was lost. IDs remain recorded across restarts. Reusing an ID for another request returns 409. Schemas reject malformed commands with 400; domain conflicts (including insufficient credit) return 409 without changing state. Dates identify the household calendar day supplied by the client; they are validated as real dates, not restricted to today.

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
| `reward.redeem` | `rewardId`, `kidId` |
| `pin.set` | `pin` (empty or four digits) |
| `household.reset` | empty object |

`repeat` is `daily`, `weekly`, or `once`. Defaults and exact validation live in `packages/contracts/src/api.js` and `packages/domain/src/commands.js`. Whole-household reset is destructive and is exposed for the existing erase-board action.

## Reads and live updates

- `GET /api/state`: legacy version-1 household document, or `null` before setup/import.
- `GET /api/kids`, `/api/chores`, `/api/rewards`: resource arrays.
- `GET /api/balances`: star and gold balances keyed by kid ID.
- `GET /api/capabilities`: command, event, and compatibility availability.
- `GET /api/events`: SSE stream; initial/current and subsequent messages carry `{ "revision": 1 }`. Fetch state after a message. Reconnecting receives the current revision; this is not an event-history API.

## Compatibility and import

`PUT /api/state` retains the original 204 response and completion/count merge semantics. Set `LEGACY_STATE_WRITES=false` to return 410 for this endpoint after upgrading all clients. New clients use commands; when connected to the old Python server they fall back to its state protocol. Legacy writes are intentionally a transition path and can bypass command rules.

`POST /api/import` accepts a version-1 household document only when the database has no household. It atomically rejects subsequent imports with 409. This supports existing browser-only boards; disk JSON migration happens automatically at startup instead.

For server-side reuse, `storage.command(command)` performs validation, transactional persistence, idempotency, and change notification. Future MCP tools should use this entry point. `applyCommand` in the shared domain package is pure and performs no I/O.

## Versions and time travel

`id` and `taskId` identify the same permanent task. `versionId` identifies immutable rules; `validFrom` records when that version was committed. Archive and restore create new versions. Send the version seen by the client with completion/count commands to preserve its credit value when an edit happens before synchronization. Omitting it uses the active version. Unknown versions and completions of archived tasks return 409.

- `GET /api/chores/archived`: archived tasks available for restoration.
- `GET /api/chores/:id/versions`: all recorded task versions, including archival versions.
- `GET /api/history`: up to 100 revision summaries, newest first. Use `?before=<oldest-revision>` for the next page.
- `GET /api/history/:revision`: immutable `{revision, recordedAt, action, state}` snapshot; missing revisions return 404.

`state.creditLedger` records task/version references and fixed point/gold values by completion key. Counts may have several allocations from different versions. Undo updates the current projection; previous allocations remain in immutable historical snapshots. Snapshot revisions are ordered by commit and include every accepted command, import, and legacy write. Retried commands do not create duplicate history entries.

Historical data starts with a migration baseline, not invented past edits. The outer household schema remains version 1 for older clients; `historyVersion: 1` identifies the added domain history fields, and SQLite schema version 2 adds durable revision snapshots. History fields are server-owned: legacy PUT requests cannot replace them. No history purge endpoint is implemented.
