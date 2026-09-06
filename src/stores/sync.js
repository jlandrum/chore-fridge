import { atom, batch } from "nanostores";
import { $revision, commit } from "./changes.js";
import { $familyName, $pin, $setupDone, $kids } from "./family.js";
import { $chores, $completions, $counts } from "./chores.js";
import { $rewards } from "./rewards.js";
import { $spent, $goldSpent } from "./balances.js";
import { mergeCompletions, mergeCounts } from "../domain/history.js";

const STORAGE_KEY = "chore-fridge-v2";
export const $serverMode = atom(false);
const fields = {
  familyName: $familyName, pin: $pin, setupDone: $setupDone, kids: $kids,
  chores: $chores, completions: $completions, counts: $counts,
  rewards: $rewards, spent: $spent, goldSpent: $goldSpent,
};
let metadata = { version: 1, nightMode: "auto", updatedAt: 0 };
let saveTimer;
let lastServer = "";
let dirty = false;

export function defaultState() {
  return {
    version: 1,
    pin: "",
    familyName: "Our Family",
    nightMode: "auto",
    kids: [],
    chores: [],
    rewards: [],
    completions: {},
    counts: {},
    spent: {},
    goldSpent: {},
    setupDone: false,
    updatedAt: 0,
  };
}

// The aggregate document exists only at this storage/network boundary.
export function serializeHousehold() {
  return { ...metadata, ...Object.fromEntries(Object.entries(fields).map(([key, store]) => [key, store.get()])) };
}

export function applySnapshot(data) {
  const next = { ...defaultState(), ...data };
  metadata = Object.fromEntries(Object.entries(next).filter(([key]) => !(key in fields)));
  batch(() => {
    for (const [key, store] of Object.entries(fields)) {
      // Incoming documents are whole snapshots. Preserve unchanged domain
      // references so a remote reward edit cannot wake chore subscribers.
      if (JSON.stringify(store.get()) !== JSON.stringify(next[key])) store.set(next[key]);
    }
  });
}

function saveLocal(snapshot) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applySnapshot(JSON.parse(raw));
  } catch {}
}

$revision.listen(() => {
  metadata = { ...metadata, updatedAt: Date.now() };
  saveLocal(serializeHousehold());
  if (!globalThis.window?.fetch) return;
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushServer, 200);
});

export function resetHousehold() {
  commit(() => applySnapshot(defaultState()));
}

async function pushServer() {
  const snapshot = JSON.stringify(serializeHousehold());
  const revision = $revision.get();
  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: snapshot,
    });
    $serverMode.set(response.ok);
    if (response.ok && $revision.get() === revision) {
      dirty = false;
      lastServer = snapshot;
    }
  } catch { $serverMode.set(false); }
}

export async function pullServer() {
  if (!globalThis.window?.fetch || dirty) return;
  try {
    const response = await fetch("/api/state");
    if (!response.ok) throw new Error("State server unavailable");
    const data = await response.json();
    $serverMode.set(true);
    if (dirty) return;
    const current = serializeHousehold();
    if (data && data.version) {
      const remoteAt = Number(data.updatedAt) || 0;
      const localAt = Number(current.updatedAt) || 0;
      if (remoteAt < localAt) { await pushServer(); return; }
      const merged = {
        ...(remoteAt > localAt ? { ...defaultState(), ...data } : current),
        completions: mergeCompletions(current.completions, data.completions),
        counts: mergeCounts(current.counts, data.counts),
      };
      const next = JSON.stringify(merged);
      if (next !== lastServer) {
        lastServer = next;
        saveLocal(merged);
        applySnapshot(merged);
      }
    } else if (current.setupDone) await pushServer();
  } catch { $serverMode.set(false); }
}
