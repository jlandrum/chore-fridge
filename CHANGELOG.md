# Changelog

User-facing changes and upgrade notes are recorded here. Move the Unreleased entries into a dated version section when a release is published.

## Unreleased — v2

### Added

- Modern (v2) theme with neutral surfaces and coordinated light and dark appearances, compiled from its own CSS theme file. Its theme tile is a compound control: the name plus a color chip. The chip’s full color sets hue, saturation, and accent brightness; surfaces stay readable. Each child’s column is tinted with that child’s color. Completed chores use the theme accent instead of a separate mint check and pink stamp, and theme tiles use the same thin border as the rest of Modern.

- Live synchronization across household devices with server-sent events and automatic retry after connection failures.
- A validated command API for tasks, family setup, rewards, and spending, with persistent request IDs that prevent duplicate actions on retry.
- Permanent task IDs and immutable versions. Editing creates a version; archiving preserves history and earned credit; restoring keeps the same task ID.
- Archive and Restore controls in parent task settings.
- Historical household revisions and task-version APIs as the foundation for time travel. The browsing interface is still planned.
- Advanced chore repeats in a side-tabbed task editor: General (title, emoji, Daily/Weekly/Once/Every), a frequency tab, Children, and Values. Daily tasks pick weekdays; Weekly can allow only one claim per week; Once archives when everyone assigned has finished (default on); Every repeats every N days, weeks, or months. Values picks one enabled currency and a value in that currency, plus an allow-multiple toggle with min/max.
- A Currency settings page with built-in credits that can be turned on and renamed: Star and Gold Star (on by default), plus Coin, Dollar, Hours, Custom 1, and Custom 2. Internal identifiers do not change.
- Board layouts, saved on this device: Classic is the current kid columns and reward dock; Gallery shows kid boards and the shop as cards together, with compact shopkeeper portraits; Slide to Buy swipes between chores and the shop, with a large shopkeeper portrait, a saying of the day, and the reward list. The shopkeeper matches the selected theme. Shop sayings are a household newline-separated list in Settings → General, saved through `settings.update` and `GET /api/sayings`. Households without a saved list use the built-in defaults. Slide arrows leave a gutter so they do not cover chores or shop items, and the shop card shadow no longer peeks in at the slide seam.
- An Advanced settings page with an MCP switch. When on, the household Node server exposes a Streamable HTTP MCP endpoint at `/mcp` and Settings shows the URL and a client config snippet. The switch defaults off.
- An append-only credit ledger: undo adds a negative reversal linked to the original credit, redo adds a new credit, and reward spending adds a debit. SQLite prevents updates or deletes to journal entries.
- Day-filtered ledger history with pagination and transactional balance totals.

### Changed

- Settings now opens as a fixed 90%-of-screen modal with accessible tab navigation, a scrollable content area, and an explicit Close button. General combines task and reward permissions and adds household-name editing, PIN management, and the household reset. The Display tab mirrors the View controls. The original theme is labeled Classic (V1).
- The add/edit task sheet keeps labels above the fields instead of overlapping them, puts the task name and emoji on one row, lays frequency out in two columns, explains counted tasks as “at least / up to”, and keeps Cancel and Save visible while the fields scroll. Each task pays out one currency.
- Task, kid, and reward sheets pick emoji from a popup overlay instead of the device keyboard, so Family Hub and other smart displays can set an emoji without stretching the form. Emoji data is served from the household app so the picker works on the LAN.
- Settings is a two-pane workspace: a navigation rail stays beside the selected page, each page keeps a title-and-subtitle block above its sections, related General controls share one stack, and page content stays in a readable column instead of stretching across the modal. On narrower screens the rail becomes a horizontal strip above the page. The dialog keeps a 90% size on both axes when the display zoom changes. Kids, Chores, and Rewards put the add action on the same row as the page title.
- Parent Mode PIN entry is a compact card over the board, without a View control. Escape or a tap outside the card returns to the board.
- Chore settings now use one insertion-ordered list with each chore's frequency shown beside its name. Every Settings page has a subtitle, and section labels use consistent uppercase styling.
- Parent Mode now uses explicit Unlock Parent Mode and Lock Parent Mode controls. Unlocking stays on the board; Settings opens separately. Reloads start locked. Settings → General uses a themed toggle to require Parent Mode for completion, undo, and count changes, with an explanation shown on blocked taps. A separate matching toggle can require Parent Mode for reward redemptions.

- Rebuilt the interface with JSOX 0.2, native web components, and independent Nano Stores that update existing DOM directly.
- Replaced the Python runtime with a Node/Fastify server and npm workspaces for the web app, server, shared domain rules, and API contracts.
- Normal board requests now return current-day records, balance information, and the status needed for weekly and one-off tasks. Past records, archived definitions, task versions, and the journal are fetched separately when needed.
- Command responses now return compact receipts instead of full household snapshots.
- Task edits no longer change the value of credits already earned. Counted tasks preserve the value of each earned allocation across edits.

### Upgrade notes

- Existing `state.json` files migrate automatically into SQLite, with an unchanged source file and a content-addressed backup. Invalid data stops startup instead of creating an empty household.
- Existing SQLite databases upgrade automatically to schema 4. Known credits and cumulative spending become opening ledger entries once, preserving balances. Extra household currencies are stored beside stars and gold.
- History begins with the available migration baseline; past edits and undo events that were never recorded cannot be recovered.
- Legacy full-state GET/PUT remains available for older clients. Modern board requests use the daily API, and daily views cannot be imported or written as complete households.
- The service remains intended for a trusted LAN. Authentication is still planned. MCP is optional and off until enabled in Settings → Advanced.
