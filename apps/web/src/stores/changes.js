import { atom, batch } from "nanostores";

// Persistence observes completed actions, never individual field writes.
export const $revision = atom(0);

export const $lastChange = atom(null);

export function commit(change, command = null) {
  batch(() => {
    change();
    $lastChange.set(command);
    $revision.set($revision.get() + 1);
  });
}
