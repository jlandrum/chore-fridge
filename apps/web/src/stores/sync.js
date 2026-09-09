import { todayKey } from "@chore-fridge/domain/dates";
import { $ui } from "./navigation.js";
import { defaultState } from "@chore-fridge/domain/state";
export { defaultState } from "@chore-fridge/domain/state";
import { atom, batch } from "nanostores";
import { $revision, $lastChange, commit } from "./changes.js";
import { $familyName, $pin, $setupDone, $kids, $requireParentModeForCompletion, $requireParentModeForRedemptions, $mcpEnabled, $sayings, $currencies } from "./family.js";
import { $chores, $completions, $counts, $archivedChores, $pastOnce } from "./chores.js";
import { $rewards, $rewardRedemptions } from "./rewards.js";
import { $spent, $goldSpent, $currencySpent, $exchangeEarned, $creditProjection, $balanceCarry } from "./balances.js";
import { mergeCompletions, mergeCounts } from "@chore-fridge/domain/history";

const STORAGE_KEY = "chore-fridge-v2";
export const $serverMode = atom(false);
const fields = {
  requireParentModeForRedemptions:$requireParentModeForRedemptions,
  requireParentModeForCompletion:$requireParentModeForCompletion,
  mcpEnabled: $mcpEnabled,
  familyName: $familyName, sayings: $sayings, currencies: $currencies, pin: $pin, setupDone: $setupDone, kids: $kids,
  chores: $chores, archivedChores: $archivedChores, completions: $completions, counts: $counts,
  rewardRedemptions: $rewardRedemptions, exchangeEarned: $exchangeEarned,
  rewards: $rewards, spent: $spent, goldSpent: $goldSpent, currencySpent: $currencySpent, creditProjection: $creditProjection, balanceCarry:$balanceCarry, pastOnce:$pastOnce,
};
let metadata = { version: 1, nightMode: "auto", updatedAt: 0 };
let saveTimer;
let lastServer = "";
let dirty = false;
const QUEUE_KEY = STORAGE_KEY + "-commands";
export const $syncError = atom("");
let queue = [];
let savedSnapshot;
let pendingBase;
let capabilities;
let probing;
let flushing;
let pulling;
let events;
let retryTimer;
let active = false;
let archivesAt;
function saveQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify({commands:queue,base:pendingBase})); } catch {}
}
async function probe() {
  if (capabilities) return capabilities;
  if (!probing) probing = (async () => {
    const response = await fetch("/api/capabilities");
    if (response.status === 404) return capabilities = {commands:false};
    if (!response.ok) throw new Error("State server unavailable");
    return capabilities = await response.json();
  })().finally(() => { probing = null; });
  return probing;
}
function accept(data) {
  if (!data) data = defaultState();
  applySnapshot(data);
  saveLocal(data);
}
function connectEvents() {
  if (!active || events || !capabilities?.events || !globalThis.EventSource) return;
  events = new EventSource("/api/events");
  events.onmessage = () => { pullServer(); };
  events.onerror = () => { $serverMode.set(false); };
}
export function startSync() {
  active = true;
  pullServer();
  const stopNavigation = $ui.listen(() => refreshArchives());
  retryTimer = setInterval(() => pullServer(), 5000);
  globalThis.window?.addEventListener?.("online", pullServer);
  return () => {
    active = false;
    stopNavigation();
    clearInterval(retryTimer);
    clearTimeout(saveTimer);
    events?.close(); events = null;
    globalThis.window?.removeEventListener?.("online", pullServer);
  };
}

// The aggregate document exists only at this storage/network boundary.
export function serializeHousehold() {
  return { ...metadata, ...Object.fromEntries(Object.entries(fields).map(([key, store]) => [key, store.get()])) };
}

export function applySnapshot(data) {
  const next = { ...defaultState(),creditProjection:null,balanceCarry:null,pastOnce:[],archivedChores:data?.dayScoped && data.setupDone ? $archivedChores.get() : [], ...data };
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
  savedSnapshot = snapshot;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { applySnapshot(JSON.parse(raw)); savedSnapshot = JSON.parse(raw); }
    const pending = JSON.parse(localStorage.getItem(QUEUE_KEY) || "{}");
    queue = pending.commands || [];
    pendingBase = pending.base;
  } catch {}
}

$revision.listen(() => {
  metadata = { ...metadata, updatedAt: Date.now() };
  const previous = savedSnapshot;
  saveLocal(serializeHousehold());
  if (!globalThis.window?.fetch) return;
  const command = $lastChange.get();
  if (command) {
    if (!queue.length) pendingBase = previous;
    queue.push({ id:Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8,"0")).join(""), ...structuredClone(command) });
    saveQueue();
  }
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushServer, 200);
});

export function resetHousehold() {
  commit(() => applySnapshot(defaultState()), {type:"household.reset",payload:{}});
}

async function pushLegacy() {
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
      queue = []; saveQueue();
      lastServer = snapshot;
    }
  } catch { $serverMode.set(false); }
}

async function pullLegacy() {
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
      if (remoteAt < localAt) { await pushLegacy(); return; }
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
    } else if (current.setupDone) await pushLegacy();
  } catch { $serverMode.set(false); }
}

async function pushServer() {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const mode = await probe();
      connectEvents();
      if (!mode.commands) return await pushLegacy();
      let latest;
      if (pendingBase?.setupDone && !pendingBase.dayScoped) {
        const response = await fetch(stateURL());
        if (!response.ok) throw new Error("State server unavailable");
        if (!(await response.json())) await importLocal(pendingBase);
      }
      while (queue.length) {
        const command = queue[0];
        const response = await fetch("/api/commands", {
          method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(command),
        });
        if (!response.ok) {
          if (response.status >= 500 || response.status === 429 || response.status === 408) throw new Error("Server unavailable; changes will retry");
          const error = await response.json();
          $syncError.set(error.message || "The server rejected a change");
          queue.shift(); saveQueue();
          continue;
        }
        await response.json();
        queue.shift(); saveQueue();
        $serverMode.set(true);
      }
      // Read again after rejections, and only reconcile once all optimistic actions finish.
      const response = await fetch(stateURL());
      if (!response.ok) throw new Error("State server unavailable");
      latest = await response.json();
      if (!queue.length) { dirty = false; pendingBase = null; saveQueue(); accept(latest); await refreshArchives(); }
    } catch { $serverMode.set(false); }
  })().finally(() => { flushing = null; });
  return flushing;
}

export function pullServer() {
  if (!pulling) pulling = performPull().finally(() => { pulling = null; });
  return pulling;
}

async function performPull() {
  if (!globalThis.window?.fetch) return;
  try {
    const mode = await probe();
    connectEvents();
    if (queue.length || dirty) return await pushServer();
    if (!mode.commands) return await pullLegacy();
    const response = await fetch(stateURL());
    if (!response.ok) throw new Error("State server unavailable");
    const data = await response.json();
    if (queue.length || dirty) return;
    // Import browser-only households once into a new, empty server.
    if (!data && serializeHousehold().setupDone && !serializeHousehold().dayScoped) {
      await importLocal(serializeHousehold());
      return await performPull();
    } else accept(data);
    $serverMode.set(true);
    await refreshArchives();
  } catch { $serverMode.set(false); }
}

async function importLocal(snapshot) {
  const response = await fetch("/api/import", {
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(snapshot),
  });
  if (!response.ok && response.status !== 409) throw new Error("Local household import failed");
}

function stateURL() {
  return capabilities?.dayBoard ? "/api/board?day="+todayKey() : "/api/state";
}
async function refreshArchives() {
  if (!globalThis.window?.fetch || !capabilities?.dayBoard || $ui.get().view !== "parent" || $ui.get().parentTab !== "chores") return;
  const revision = metadata.revision ?? metadata.updatedAt;
  if (archivesAt === revision) return;
  try {
    const response = await fetch("/api/chores/archived");
    const items = response.ok ? await response.json() : null;
    if (items && !queue.length && (metadata.revision ?? metadata.updatedAt) === revision) { $archivedChores.set(items); archivesAt = revision; }
  } catch {}
}
