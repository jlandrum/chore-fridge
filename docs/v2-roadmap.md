# Chore Fridge v2: product direction

Status: proposed roadmap; implementation has not started.

## Product promise

A household can set up a shared chore board in minutes, understand what each child needs to do, and trust that completed work and earned rewards are saved.

Start with the existing self-hosted household use case. Hosted accounts, pricing, and public access need a separate product decision before implementation.

## 1. Make household data dependable

- Add state schema validation and explicit migrations for older installations.
- Make saves retry after temporary connection failures; show saving, saved, offline, and error states.
- Cover completion, undo, repeat counts, reward redemption, and concurrent-device updates with meaningful tests.
- Add household export, validated import, and a documented restore path.

Acceptance: a temporary network failure does not silently lose a completed chore; malformed imports leave existing data intact; an exported board can be restored with balances and history preserved.

## 2. Make the first session useful

- Guide a parent through household setup, the first child, the first chore, and the first reward.
- Offer editable starter chores and explain regular versus gold stars.
- Give empty screens a clear next action.
- Explain the parent PIN's convenience-lock role during setup.

Acceptance: a new household can reach a usable board without reading repository documentation.

## 3. Make daily use clear and accessible

- Clarify due chores, progress, repeat counts, and reward affordability.
- Provide consistent undo and confirmation behavior for consequential actions.
- Verify keyboard operation, focus, contrast, and touch targets across themes.
- Check portrait tablets, fridge browsers, small screens, and zoom extremes.

Acceptance: core flows work at supported screen sizes and appearance settings, with understandable feedback for every save or failure.

## 4. Make releases repeatable

- Extend CI with state and browser-flow checks as those features land.
- Document supported devices, upgrade steps, backup/restore, and troubleshooting.
- Add versioned release notes and a repeatable release checklist.
- Choose a license before encouraging redistribution.

Acceptance: a household can install, upgrade, and recover using published instructions; release checks run automatically.

## Decisions before expanding scope

- Stay self-hosted, offer managed hosting, or support both?
- Who is the initial audience, and which devices must be supported?
- Should parents approve completions and reward claims?
- What history should remain when chores or children are removed?

Public hosting requires real authentication, household isolation, authorization, and transport security; the current PIN is not an access-control boundary.

## Suggested first implementation

Start with visible save/sync status and reliable retry behavior, backed by tests for offline recovery. This improves daily trust and gives later product features a dependable foundation.
