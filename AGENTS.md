# JSOX architecture

JSOX is direct DOM construction and manipulation, not a rendering framework.

- Do not introduce a paint/render cycle, virtual DOM, or app-wide refresh bus.
- Construct component DOM once where practical; update existing nodes and properties in response to the state that component owns or subscribes to.
- Use Nano Stores for state and derived values. Keep subscriptions scoped to the relevant component and clean them up on disconnect.
- Use explicit state actions. Keep household persistence separate from local UI and display preferences.
- Preserve the existing server API and household data format unless a task explicitly changes them.

- Keep domain stores independent. Assemble the aggregate household document only at the persistence boundary; do not reintroduce a monolithic store or whole-document cloning for local actions.
