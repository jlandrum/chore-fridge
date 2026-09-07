# Changelog

User-facing changes and upgrade notes are recorded here. Move the Unreleased entries into a dated version section when a release is published.

## Unreleased — v2

### Added

- Live synchronization across household devices with server-sent events and automatic retry after connection failures.
- A validated command API for tasks, family setup, rewards, and spending, with persistent request IDs that prevent duplicate actions on retry.
- Permanent task IDs and immutable versions. Editing creates a version; archiving preserves history and earned credit; restoring keeps the same task ID.
- Archive and Restore controls in parent task settings.
- Historical household revisions and task-version APIs as the foundation for time travel. The browsing interface is still planned.
- An append-only credit ledger: undo adds a negative reversal linked to the original credit, redo adds a new credit, and reward spending adds a debit. SQLite prevents updates or deletes to journal entries.
- Day-filtered ledger history with pagination and transactional balance totals.

### Changed

- Parent Mode now uses explicit Unlock Parent Mode and Lock Parent Mode controls. Unlocking stays on the board; Settings opens separately. Reloads start locked. Settings → General uses a themed toggle to require Parent Mode for completion, undo, and count changes, with an explanation shown on blocked taps. A separate matching toggle can require Parent Mode for reward redemptions.

- Rebuilt the interface with JSOX 0.2, native web components, and independent Nano Stores that update existing DOM directly.
- Replaced the Python runtime with a Node/Fastify server and npm workspaces for the web app, server, shared domain rules, and API contracts.
- Normal board requests now return current-day records, balance information, and the status needed for weekly and one-off tasks. Past records, archived definitions, task versions, and the journal are fetched separately when needed.
- Command responses now return compact receipts instead of full household snapshots.
- Task edits no longer change the value of credits already earned. Counted tasks preserve the value of each earned allocation across edits.

### Upgrade notes

- Existing `state.json` files migrate automatically into SQLite, with an unchanged source file and a content-addressed backup. Invalid data stops startup instead of creating an empty household.
- Existing SQLite databases upgrade automatically to schema 3. Known credits and cumulative spending become opening ledger entries once, preserving balances.
- History begins with the available migration baseline; past edits and undo events that were never recorded cannot be recovered.
- Legacy full-state GET/PUT remains available for older clients. Modern board requests use the daily API, and daily views cannot be imported or written as complete households.
- The service remains intended for a trusted LAN. Authentication and MCP support are still planned.
