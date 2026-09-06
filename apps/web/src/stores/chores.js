import { $requireParentModeForCompletion } from "./family.js";
import { $ui } from "./navigation.js";
import * as rules from "@chore-fridge/domain/chores";
import { ck, isCounted, maxCount, isOnce, isWeekly } from "@chore-fridge/domain/chores";
import { atom } from "nanostores";
import { commit } from "./changes.js";
import { uid, upsert } from "@chore-fridge/domain/records";
import { todayKey, datesInWeek } from "@chore-fridge/domain/dates";
import { countRec } from "@chore-fridge/domain/history";

export const $pastOnce = atom([]);
export const $archivedChores = atom([]);
export const $chores = atom([]);
export const $completions = atom({});
export const $counts = atom({});
let lastTap = 0;

export { ck, timesEarned, isOnce, isWeekly, choreKind, minCount, maxCount, isCounted } from "@chore-fridge/domain/chores";
const snapshot = () => ({ chores: $chores.get(), counts: $counts.get(), completions: $completions.get(), pastOnce:$pastOnce.get() });
export function countFor(...args) { return rules.countFor(snapshot(), ...args); }
export function isDone(...args) { return rules.isDone(snapshot(), ...args); }
export function choresForKid(...args) { return rules.choresForKid(snapshot(), ...args); }
export function dailyChores(...args) { return rules.dailyChores(snapshot(), ...args); }
export function weeklyChores(...args) { return rules.weeklyChores(snapshot(), ...args); }
export function oneOffChores(...args) { return rules.oneOffChores(snapshot(), ...args); }

export function bumpChore(choreId, kidId, delta) {
  if (delta > 0 && completionLocked()) return {error:"Unlock Parent Mode to complete tasks."};
  const now = Date.now();
  if (now - lastTap < 280) return { skipped: true };
  lastTap = now;
  const chore = $chores.get().find((item) => item.id === choreId);
  if (!chore || !isCounted(chore)) return { skipped: true };
  const key = ck(choreId, kidId);
  const cur = countFor(chore, kidId);
  const next = Math.max(0, Math.min(maxCount(chore), cur + delta));
  if (next === cur) return { skipped: true };
  commit(() => $counts.set({ ...$counts.get(), [key]: { n: next, t: Date.now() } }), { type:"chore.count", payload:{choreId,kidId,delta,day:todayKey(),...(chore.versionId ? {versionId:chore.versionId} : {})} });
  const chores = choresForKid(kidId);
  const all = chores.length && chores.every((c) => isDone(c, kidId));
  if (navigator.vibrate) navigator.vibrate(12);
  return { all, count: next };
}

export function toggleChore(choreId, kidId) {
  const task = $chores.get().find(item => item.id === choreId);
  if (task && (isCounted(task) || !isDone(task,kidId)) && completionLocked()) return {error:"Unlock Parent Mode to complete tasks."};
  const now = Date.now();
  if (now - lastTap < 280) return { skipped: true };
  lastTap = now;
  const chore = $chores.get().find((item) => item.id === choreId);
  if (!chore) return { skipped: true };
  if (isCounted(chore)) {
    lastTap = 0;
    return bumpChore(choreId, kidId, 1);
  }
  const type = isDone(chore, kidId) ? "chore.undo" : "chore.complete";
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
  }, { type, payload:{choreId,kidId,day:todayKey(),...(chore.versionId ? {versionId:chore.versionId} : {})} });
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
  commit(() => $chores.set(upsert($chores.get(), chore)), { type:"chore.save", payload:chore });
  return chore;
}

export function removeChore(id) {
  commit(() => {
    const chore = $chores.get().find(chore => chore.id === id);
    if (chore?.versionId) $archivedChores.set([...$archivedChores.get(),{...chore,archived:true}]);
    $chores.set($chores.get().filter(chore => chore.id !== id));
  }, { type:"chore.remove", payload:{id} });
}

export function restoreChore(id) {
  const chore = $archivedChores.get().find(chore => chore.id === id);
  if (!chore) return;
  commit(() => {
    $archivedChores.set($archivedChores.get().filter(chore => chore.id !== id));
    $chores.set([...$chores.get(),{...chore,archived:false}]);
  }, {type:"chore.restore",payload:{id}});
}

function completionLocked() {
  return $requireParentModeForCompletion.get() && !$ui.get().parentUnlocked;
}
