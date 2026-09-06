const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function paint() {
  for (const listener of listeners) listener();
}
