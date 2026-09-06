import { atom, batch } from "nanostores";

// Persistence observes completed actions, never individual field writes.
export const $revision = atom(0);

export function commit(change) {
  batch(() => {
    change();
    $revision.set($revision.get() + 1);
  });
}
