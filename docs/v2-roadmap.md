# Chore Fridge v2 roadmap

- [ ] Child-specific options, including a theme the child can choose for only their card
- [x] Parent Mode lock/unlock, separate Settings, and optional task/redemption locks
- [x] New display modes
- [ ] Onboarding process
- [ ] More advanced repeating options
  - [ ] Daily tasks on selected days of the week
- [x] Rewrite in JSOX 0.2, using web components to simplify the codebase
- [x] Nano Stores state management with direct DOM subscriptions
- [x] MCP support
- [x] API support: validated commands and household reads
- [x] Node workspace with shared domain rules and contracts
- [x] Automatic legacy JSON migration to transactional SQLite
- [x] Live synchronization with SSE and durable command retries
- [ ] Shared tasks: completion credits the person who finishes it and marks it done for everyone
- [x] Time travel storage foundation: immutable task versions, archival, fixed credits, historical revisions
- [x] Append-only credit ledger with linked undo reversals and transactional balances
- [x] Daily board responses and paginated ledger history
- [ ] Time travel browsing interface
- [ ] Login required to mark tasks as done

## To investigate

- [ ] Custom themes without modifying source code
- [ ] Mobile app
- [ ] Custom credit types
- [ ] Custom credit displays (stars, coins, etc.)
- [ ] Custom background, separate from the theme
- [ ] Actual authentication
