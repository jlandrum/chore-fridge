import { atom, map, computed, batch } from "nanostores";

export const STORAGE_KEY = "chore-fridge-v2";

export const COLORS = ["#e85d4c", "#2a9d8f", "#e9b44c", "#6c63c0", "#4a7c59", "#d9480f"];
export const KID_EMOJIS = ["🐻", "🦁", "🐸", "🦊", "🐼", "🐰", "🦄", "🐲", "🐯", "🐮", "🐙", "⭐"];

export const $ui = map({
  view: "board",
  parentTab: "kids",
  pinBuf: "",
  pinMode: "enter",
});

export const $setup = map({
  step: 0,
  familyName: "Our Family",
  kids: [],
  picked: {},
});

export const $household = atom(defaultState());
export const $clock = atom(Date.now());
// Read-only live bindings keep domain rules and JSOX expressions concise.
// All writes go through actions below; Nano Stores owns each current snapshot.
export let state = $household.get();
export let ui = $ui.get();
export let setup = $setup.get();
$household.listen((value) => { state = value; });
$ui.listen((value) => { ui = value; });
$setup.listen((value) => { setup = value; });

export function setUI(patch) { $ui.set({ ...$ui.get(), ...patch }); }
export function setSetup(patch) { $setup.set({ ...$setup.get(), ...patch }); }
export function tick() { $clock.set(Date.now()); }
export let serverMode = false;

let saveTimer = null;
let lastServer = "";
let lastTap = 0;
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

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

export function todayKey(d = new Date()) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function datesInWeek(d = new Date()) {
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = mon.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  mon.setDate(mon.getDate() + diff);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    out.push(todayKey(x));
  }
  return out;
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) replaceState(Object.assign(defaultState(), JSON.parse(raw)));
  } catch {}
}

export function updateHousehold(change) {
  // Household state is JSON data. Copy before mutation so previous snapshots
  // and computed-store inputs remain stable throughout a transaction.
  const next = JSON.parse(JSON.stringify($household.get()));
  change(next);
  next.updatedAt = Date.now();
  persist(next);
  $household.set(next);
}

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  if (!window.fetch) return;
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushServer, 200);
}

function mergeCompletions(a, b) {
  const out = Object.assign({}, a || {});
  const other = b || {};
  for (const key of Object.keys(other)) {
    const incoming = Number(other[key]) || 0;
    const current = Number(out[key]) || 0;
    if (!out[key] || Math.abs(incoming) >= Math.abs(current)) out[key] = incoming;
  }
  return out;
}

function countRec(v) {
  if (v && typeof v === "object") {
    return { n: Math.max(0, Number(v.n) || 0), t: Number(v.t) || 0 };
  }
  const n = Number(v) || 0;
  return { n: Math.max(0, n), t: 0 };
}

function mergeCounts(a, b) {
  const out = Object.assign({}, a || {});
  const other = b || {};
  for (const key of Object.keys(other)) {
    const incoming = countRec(other[key]);
    const current = out[key] ? countRec(out[key]) : null;
    if (!current || incoming.t >= current.t) out[key] = incoming;
  }
  return out;
}

function pushServer() {
  const snapshot = JSON.stringify(state);
  const at = state.updatedAt;
  fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: snapshot,
  })
    .then((r) => {
      serverMode = r.ok;
      if (r.ok && state.updatedAt === at) {
        dirty = false;
        lastServer = snapshot;
      }
    })
    .catch(() => {
      serverMode = false;
    });
}

export function pullServer() {
  if (!window.fetch || dirty) return;
  fetch("/api/state")
    .then((r) => {
      if (!r.ok) throw new Error("no");
      return r.json();
    })
    .then((data) => {
      serverMode = true;
      if (dirty) return;
      if (data && data.version) {
        const comps = mergeCompletions(state.completions, data.completions);
        const counts = mergeCounts(state.counts, data.counts);
        const remoteAt = Number(data.updatedAt) || 0;
        const localAt = Number(state.updatedAt) || 0;
        if (remoteAt < localAt) {
          pushServer();
          return;
        }
        const merged = { ...(remoteAt > localAt ? Object.assign(defaultState(), data) : state), completions: comps, counts };
        const next = JSON.stringify(merged);
        if (next !== lastServer) {
          lastServer = next;
          try {
            localStorage.setItem(STORAGE_KEY, next);
          } catch {}
          replaceState(merged);
        }
      } else if (state.setupDone) {
        pushServer();
      }
    })
    .catch(() => {
      serverMode = false;
    });
}

export function ck(choreId, kidId, day) {
  return (day || todayKey()) + ":" + choreId + ":" + kidId;
}

function parseCk(key) {
  const parts = String(key).split(":");
  if (parts.length !== 3) return null;
  return { day: parts[0], choreId: parts[1], kidId: parts[2] };
}

export function timesEarned(chore, kidId, household = state) {
  const days = {};
  const counts = household.counts || {};
  for (const key of Object.keys(counts)) {
    const parsed = parseCk(key);
    if (!parsed || parsed.choreId !== chore.id || parsed.kidId !== kidId) continue;
    const n = countRec(counts[key]).n;
    if (n) days[parsed.day] = n;
  }
  const comps = household.completions || {};
  for (const key of Object.keys(comps)) {
    const parsed = parseCk(key);
    if (!parsed || parsed.choreId !== chore.id || parsed.kidId !== kidId) continue;
    if (Number(comps[key]) > 0 && !days[parsed.day]) days[parsed.day] = 1;
  }
  let n = 0;
  for (const day of Object.keys(days)) n += days[day];
  return n;
}

export function isOnce(chore) {
  return chore.repeat === "once";
}

export function isWeekly(chore) {
  return chore.repeat === "weekly";
}

export function choreKind(chore) {
  if (isOnce(chore)) return "Once";
  if (isWeekly(chore)) return "Weekly";
  return "Daily";
}

export function minCount(chore) {
  return Math.max(1, parseInt(chore.minCount, 10) || 1);
}

export function maxCount(chore) {
  return Math.max(minCount(chore), parseInt(chore.maxCount, 10) || 1);
}

export function isCounted(chore) {
  return maxCount(chore) > 1;
}

export function countFor(chore, kidId, date = new Date()) {
  const rec = (state.counts || {})[ck(chore.id, kidId, todayKey(date))];
  return rec ? countRec(rec).n : 0;
}

export function isDone(chore, kidId, date = new Date()) {
  if (isCounted(chore)) return countFor(chore, kidId, date) >= minCount(chore);
  if (isOnce(chore)) {
    const suffix = ":" + chore.id + ":" + kidId;
    return Object.keys(state.completions).some((key) => {
      return key.includes(suffix) && Number(state.completions[key]) > 0;
    });
  }
  if (isWeekly(chore)) {
    return datesInWeek(date).some((day) => Number(state.completions[ck(chore.id, kidId, day)] || 0) > 0);
  }
  return Number(state.completions[ck(chore.id, kidId, todayKey(date))] || 0) > 0;
}

export function appliesToday(chore, date = new Date()) {
  if (!isOnce(chore)) return true;
  const day = todayKey(date);
  const open = (chore.kidIds || []).some((id) => !isDone(chore, id, date));
  if (open) return true;
  return Object.keys(state.completions).some((key) => {
    return key.startsWith(day + ":" + chore.id + ":") && Number(state.completions[key]) > 0;
  });
}

function kindRank(chore) {
  if (isOnce(chore)) return 2;
  if (isWeekly(chore)) return 1;
  return 0;
}

function boardRank(chore, kidId) {
  const done = isDone(chore, kidId);
  const counted = isCounted(chore);
  const extra = counted && done && countFor(chore, kidId) < maxCount(chore);
  const bucket = !done ? 0 : extra ? 1 : 2;
  return [bucket, chore.gold ? 0 : 1, kindRank(chore), (chore.title || "").toLowerCase()];
}

export function choresForKid(kidId) {
  return state.chores
    .filter((c) => c.kidIds.includes(kidId) && appliesToday(c))
    .slice()
    .sort((a, b) => {
      const ra = boardRank(a, kidId);
      const rb = boardRank(b, kidId);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] < rb[i]) return -1;
        if (ra[i] > rb[i]) return 1;
      }
      return 0;
    });
}

export function dailyChores() {
  return state.chores.filter((c) => !isOnce(c) && !isWeekly(c));
}

export function weeklyChores() {
  return state.chores.filter((c) => isWeekly(c));
}

export function oneOffChores() {
  return state.chores.filter((c) => isOnce(c) && appliesToday(c));
}

export const $balances = computed($household, (household) => {
  const balances = {};
  for (const kid of household.kids) {
    let stars = 0;
    let gold = 0;
    for (const chore of household.chores) {
      if (!(chore.kidIds || []).includes(kid.id)) continue;
      const count = timesEarned(chore, kid.id, household);
      stars += (chore.points || 0) * count;
      if (chore.gold) gold += count;
    }
    balances[kid.id] = {
      stars: Math.max(0, stars - (household.spent[kid.id] || 0)),
      gold: Math.max(0, gold - (household.goldSpent[kid.id] || 0)),
    };
  }
  return balances;
});

export function starsFor(kidId) { return $balances.get()[kidId]?.stars || 0; }
export function goldFor(kidId) { return $balances.get()[kidId]?.gold || 0; }
export function familyStars() { return Object.values($balances.get()).reduce((sum, value) => sum + value.stars, 0); }
export function familyGold() { return Object.values($balances.get()).reduce((sum, value) => sum + value.gold, 0); }

export function byId(list, id) {
  return list.find((item) => item.id === id) || null;
}

export function prettyDate() {
  try {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return todayKey();
  }
}

export function resetSetup() {
  setSetup({ step: 0, familyName: "Our Family", kids: [], picked: {} });
}

export function replaceState(next) {
  $household.set(next);
}

export function bumpChore(choreId, kidId, delta) {
  const now = Date.now();
  if (now - lastTap < 280) return { skipped: true };
  lastTap = now;
  const chore = byId(state.chores, choreId);
  if (!chore || !isCounted(chore)) return { skipped: true };
  const key = ck(choreId, kidId);
  const cur = countFor(chore, kidId);
  const next = Math.max(0, Math.min(maxCount(chore), cur + delta));
  if (next === cur) return { skipped: true };
  updateHousehold((draft) => {
    if (!draft.counts) draft.counts = {};
    draft.counts[key] = { n: next, t: Date.now() };
  });
  const chores = choresForKid(kidId);
  const all = chores.length && chores.every((c) => isDone(c, kidId));
  if (navigator.vibrate) navigator.vibrate(12);
  return { all, count: next };
}

export function toggleChore(choreId, kidId) {
  const now = Date.now();
  if (now - lastTap < 280) return { skipped: true };
  lastTap = now;
  const chore = byId(state.chores, choreId);
  if (!chore) return { skipped: true };
  if (isCounted(chore)) {
    lastTap = 0;
    return bumpChore(choreId, kidId, 1);
  }
  updateHousehold((draft) => {
    if (isOnce(chore)) {
      const suffix = ":" + chore.id + ":" + kidId;
      const existing = Object.keys(draft.completions).find(
        (key) => key.includes(suffix) && Number(draft.completions[key]) > 0
      );
      if (existing) draft.completions[existing] = -Date.now();
      else draft.completions[ck(choreId, kidId)] = Date.now();
    } else if (isWeekly(chore)) {
      const hit = datesInWeek().find((day) => Number(draft.completions[ck(choreId, kidId, day)] || 0) > 0);
      if (hit) draft.completions[ck(choreId, kidId, hit)] = -Date.now();
      else draft.completions[ck(choreId, kidId)] = Date.now();
    } else {
      const key = ck(choreId, kidId);
      if (Number(draft.completions[key] || 0) > 0) draft.completions[key] = -Date.now();
      else draft.completions[key] = Date.now();
    }
  });
  const chores = choresForKid(kidId);
  const all = chores.length && chores.every((c) => isDone(c, kidId));
  if (navigator.vibrate) navigator.vibrate(12);
  return { all };
}

export function finishSetup(pin) {
  pin = String(pin || "").replace(/\D/g, "").slice(0, 4);
  if (pin.length && pin.length !== 4) return { error: "PIN needs 4 digits" };
  if (!setup.kids.length) return { error: "Add at least one kid" };
  batch(() => {
    setUI({ view: "board" });
    updateHousehold((draft) => {
      draft.familyName = setup.familyName || "Our Family";
      draft.kids = setup.kids.map((kid) => ({ ...kid }));
      draft.chores = [];
      draft.rewards = [];
      draft.pin = pin;
      draft.setupDone = true;
    });
  });
  return { ok: true };
}

export function saveChore(payload) {
  const repeat = payload.repeat === "once" || payload.repeat === "weekly" ? payload.repeat : "daily";
  const fallbackEmoji = repeat === "once" ? "📌" : repeat === "weekly" ? "📅" : "🔁";
  let minC = Math.max(1, parseInt(payload.minCount, 10) || 1);
  let maxC = Math.max(1, parseInt(payload.maxCount, 10) || 1);
  if (maxC < minC) maxC = minC;
  const chore = {
    id: payload.id || uid(),
    title: payload.title,
    emoji: payload.emoji || fallbackEmoji,
    points: Math.max(0, payload.points || 0),
    repeat,
    kidIds: payload.kidIds.slice(),
    minCount: minC,
    maxCount: maxC,
    gold: !!payload.gold,
  };
  updateHousehold((draft) => {
    const i = draft.chores.findIndex((c) => c.id === chore.id);
    if (i >= 0) draft.chores[i] = chore;
    else draft.chores.push(chore);
  });
  return chore;
}

export function removeChore(id) {
  updateHousehold((draft) => { draft.chores = draft.chores.filter((c) => c.id !== id); });
}

export function redeemReward(rewardId, kidId) {
  const reward = byId(state.rewards, rewardId);
  if (!reward) return { error: "Missing reward" };
  if (reward.gold) {
    if (goldFor(kidId) < reward.cost) return { error: "Not enough gold stars yet" };
    updateHousehold((draft) => { draft.goldSpent[kidId] = (draft.goldSpent[kidId] || 0) + reward.cost; });
  } else {
    if (starsFor(kidId) < reward.cost) return { error: "Not enough stars yet" };
    updateHousehold((draft) => { draft.spent[kidId] = (draft.spent[kidId] || 0) + reward.cost; });
  }
  return { ok: true, reward, kid: byId(state.kids, kidId) };
}

export function saveKid(kid) {
  updateHousehold((draft) => {
    const index = draft.kids.findIndex((item) => item.id === kid.id);
    if (index < 0) draft.kids.push({ ...kid, id: kid.id || uid() });
    else draft.kids[index] = { ...kid };
  });
}

export function removeKid(id) {
  updateHousehold((draft) => { draft.kids = draft.kids.filter((kid) => kid.id !== id); });
}

export function saveReward(reward) {
  updateHousehold((draft) => {
    const index = draft.rewards.findIndex((item) => item.id === reward.id);
    if (index < 0) draft.rewards.push({ ...reward, id: reward.id || uid() });
    else draft.rewards[index] = { ...reward };
  });
}

export function removeReward(id) {
  updateHousehold((draft) => { draft.rewards = draft.rewards.filter((reward) => reward.id !== id); });
}

export function setPin(pin) { updateHousehold((draft) => { draft.pin = pin; }); }

export function eraseBoard() {
  batch(() => {
    resetSetup();
    setUI({ view: "board", pinBuf: "" });
    const next = defaultState();
    next.updatedAt = Date.now();
    persist(next);
    replaceState(next);
  });
}
