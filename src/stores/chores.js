import { atom } from "nanostores";
import { commit } from "./changes.js";
import { uid, upsert } from "../domain/records.js";
import { todayKey, datesInWeek } from "../domain/dates.js";
import { countRec } from "../domain/history.js";

export const $chores = atom([]);
export const $completions = atom({});
export const $counts = atom({});
let lastTap = 0;

export function ck(choreId, kidId, day) {
  return (day || todayKey()) + ":" + choreId + ":" + kidId;
}

function parseCk(key) {
  const parts = String(key).split(":");
  if (parts.length !== 3) return null;
  return { day: parts[0], choreId: parts[1], kidId: parts[2] };
}

export function timesEarned(chore, kidId, household) {
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
  const rec = ($counts.get() || {})[ck(chore.id, kidId, todayKey(date))];
  return rec ? countRec(rec).n : 0;
}

export function isDone(chore, kidId, date = new Date()) {
  if (isCounted(chore)) return countFor(chore, kidId, date) >= minCount(chore);
  if (isOnce(chore)) {
    const suffix = ":" + chore.id + ":" + kidId;
    return Object.keys($completions.get()).some((key) => {
      return key.includes(suffix) && Number($completions.get()[key]) > 0;
    });
  }
  if (isWeekly(chore)) {
    return datesInWeek(date).some((day) => Number($completions.get()[ck(chore.id, kidId, day)] || 0) > 0);
  }
  return Number($completions.get()[ck(chore.id, kidId, todayKey(date))] || 0) > 0;
}

function appliesToday(chore, date = new Date()) {
  if (!isOnce(chore)) return true;
  const day = todayKey(date);
  const open = (chore.kidIds || []).some((id) => !isDone(chore, id, date));
  if (open) return true;
  return Object.keys($completions.get()).some((key) => {
    return key.startsWith(day + ":" + chore.id + ":") && Number($completions.get()[key]) > 0;
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
  return $chores.get()
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
  return $chores.get().filter((c) => !isOnce(c) && !isWeekly(c));
}

export function weeklyChores() {
  return $chores.get().filter((c) => isWeekly(c));
}

export function oneOffChores() {
  return $chores.get().filter((c) => isOnce(c) && appliesToday(c));
}

export function bumpChore(choreId, kidId, delta) {
  const now = Date.now();
  if (now - lastTap < 280) return { skipped: true };
  lastTap = now;
  const chore = $chores.get().find((item) => item.id === choreId);
  if (!chore || !isCounted(chore)) return { skipped: true };
  const key = ck(choreId, kidId);
  const cur = countFor(chore, kidId);
  const next = Math.max(0, Math.min(maxCount(chore), cur + delta));
  if (next === cur) return { skipped: true };
  commit(() => $counts.set({ ...$counts.get(), [key]: { n: next, t: Date.now() } }));
  const chores = choresForKid(kidId);
  const all = chores.length && chores.every((c) => isDone(c, kidId));
  if (navigator.vibrate) navigator.vibrate(12);
  return { all, count: next };
}

export function toggleChore(choreId, kidId) {
  const now = Date.now();
  if (now - lastTap < 280) return { skipped: true };
  lastTap = now;
  const chore = $chores.get().find((item) => item.id === choreId);
  if (!chore) return { skipped: true };
  if (isCounted(chore)) {
    lastTap = 0;
    return bumpChore(choreId, kidId, 1);
  }
  commit(() => {
    const completions = { ...$completions.get() };
    if (isOnce(chore)) {
      const suffix = ":" + chore.id + ":" + kidId;
      const existing = Object.keys(completions).find(
        (key) => key.includes(suffix) && Number(completions[key]) > 0
      );
      if (existing) completions[existing] = -Date.now();
      else completions[ck(choreId, kidId)] = Date.now();
    } else if (isWeekly(chore)) {
      const hit = datesInWeek().find((day) => Number(completions[ck(choreId, kidId, day)] || 0) > 0);
      if (hit) completions[ck(choreId, kidId, hit)] = -Date.now();
      else completions[ck(choreId, kidId)] = Date.now();
    } else {
      const key = ck(choreId, kidId);
      if (Number(completions[key] || 0) > 0) completions[key] = -Date.now();
      else completions[key] = Date.now();
    }
    $completions.set(completions);
  });
  const chores = choresForKid(kidId);
  const all = chores.length && chores.every((c) => isDone(c, kidId));
  if (navigator.vibrate) navigator.vibrate(12);
  return { all };
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
  commit(() => $chores.set(upsert($chores.get(), chore)));
  return chore;
}

export function removeChore(id) {
  commit(() => $chores.set($chores.get().filter((chore) => chore.id !== id)));
}

