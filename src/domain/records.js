export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function upsert(items, item) {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => existing.id === item.id ? item : existing)
    : [...items, item];
}
