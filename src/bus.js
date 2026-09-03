export function sync() {
  if (typeof sync.impl === "function") sync.impl();
}

export function setSync(fn) {
  sync.impl = fn;
}

export const paint = sync;
