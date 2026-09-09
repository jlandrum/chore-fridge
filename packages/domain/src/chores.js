import { todayKey, datesInWeek, parseDay, daysBetween } from "./dates.js";
import { countRec } from "./history.js";
import { currencyId } from "./currencies.js";

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const REPEAT_KINDS = ["daily", "weekly", "once", "every"];
export const EVERY_UNITS = ["days", "weeks", "months"];

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

export function isEvery(chore) {
  return chore.repeat === "every";
}

export function isDaily(chore) {
  return !isOnce(chore) && !isWeekly(chore) && !isEvery(chore);
}

export function normalizeWeekdays(list) {
  if (!Array.isArray(list) || !list.length) return ALL_WEEKDAYS.slice();
  const next = [...new Set(list.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b);
  return next.length ? next : ALL_WEEKDAYS.slice();
}

export function everyN(chore) {
  return Math.max(1, Math.min(365, parseInt(chore.everyN, 10) || 1));
}

export function everyUnit(chore) {
  return EVERY_UNITS.includes(chore.everyUnit) ? chore.everyUnit : "days";
}

export function choreKind(chore) {
  if (isOnce(chore)) return "Once";
  if (isWeekly(chore)) return chore.sharedClaim ? "Weekly · one claim" : "Weekly";
  if (isEvery(chore)) {
    const n = everyN(chore);
    const unit = everyUnit(chore);
    if (n === 1) return unit === "days" ? "Every day" : unit === "weeks" ? "Every week" : "Every month";
    return "Every " + n + " " + unit;
  }
  const days = normalizeWeekdays(chore.weekdays);
  if (days.length < 7) return "Daily";
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

export function isDueOn(chore, date = new Date()) {
  if (isOnce(chore) || isWeekly(chore)) return true;
  if (isEvery(chore)) return everyDue(chore, date);
  return normalizeWeekdays(chore.weekdays).includes(date.getDay());
}

function everyDue(chore, date) {
  const anchor = parseDay(chore.anchorDay) || date;
  const n = everyN(chore);
  const diff = daysBetween(anchor, date);
  if (diff < 0) return false;
  const unit = everyUnit(chore);
  if (unit === "weeks") return date.getDay() === anchor.getDay() && Math.round(diff / 7) % n === 0;
  if (unit === "months") {
    const months = (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
    if (months < 0 || months % n !== 0) return false;
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return date.getDate() === Math.min(anchor.getDate(), last);
  }
  return diff % n === 0;
}

export function normalizeChore(payload, now = new Date()) {
  const repeat = REPEAT_KINDS.includes(payload.repeat) ? payload.repeat : "daily";
  let minC = Math.max(1, parseInt(payload.minCount, 10) || 1);
  let maxC = Math.max(1, parseInt(payload.maxCount, 10) || 1);
  if (maxC < minC) maxC = minC;
  const fallback = repeat === "once" ? "📌" : repeat === "weekly" ? "📅" : repeat === "every" ? "⏱" : "🔁";
  const chore = {
    id: payload.id,
    title: String(payload.title || "").trim(),
    emoji: payload.emoji || fallback,
    points: Math.max(0, parseInt(payload.points, 10) || 0),
    repeat,
    kidIds: (payload.kidIds || []).slice(),
    minCount: minC,
    maxCount: maxC,
    currency: currencyId(payload),
    gold: currencyId(payload) === "gold",
  };
  if (repeat === "daily") chore.weekdays = normalizeWeekdays(payload.weekdays);
  if (repeat === "weekly") chore.sharedClaim = !!payload.sharedClaim;
  if (repeat === "once") chore.archiveOnComplete = payload.archiveOnComplete !== false;
  if (repeat === "every") {
    chore.everyN = everyN(payload);
    chore.everyUnit = everyUnit(payload);
    chore.anchorDay = parseDay(payload.anchorDay) ? payload.anchorDay : todayKey(now);
  }
  return chore;
}

export function countFor(household, chore, kidId, date = new Date()) {
  const rec = (household.counts || {})[ck(chore.id, kidId, todayKey(date))];
  return rec ? countRec(rec).n : 0;
}

export function claimedBy(household, chore, date = new Date()) {
  if (!isWeekly(chore) || !chore.sharedClaim) return null;
  for (const kidId of chore.kidIds || []) {
    if (datesInWeek(date).some((day) => Number((household.completions || {})[ck(chore.id, kidId, day)] || 0) > 0)) {
      return kidId;
    }
  }
  return null;
}

export function isDone(household, chore, kidId, date = new Date()) {
  if (isCounted(chore)) return countFor(household, chore, kidId, date) >= minCount(chore);
  if (isOnce(chore)) {
    const suffix = ":" + chore.id + ":" + kidId;
    return Object.keys(household.completions || {}).some((key) => {
      return key.includes(suffix) && Number(household.completions[key]) > 0;
    });
  }
  if (isWeekly(chore)) {
    if (chore.sharedClaim) return !!claimedBy(household, chore, date);
    return datesInWeek(date).some((day) => Number((household.completions || {})[ck(chore.id, kidId, day)] || 0) > 0);
  }
  return Number((household.completions || {})[ck(chore.id, kidId, todayKey(date))] || 0) > 0;
}

export function allAssignedDone(household, chore, date = new Date()) {
  return (chore.kidIds || []).every((id) => isDone(household, chore, id, date));
}

function appliesToday(household, chore, date = new Date()) {
  if (!isDueOn(chore, date)) return false;
  if (!isOnce(chore)) return true;
  const day = todayKey(date);
  const open = (chore.kidIds || []).some((id) => !isDone(household, chore, id, date));
  if (open) return true;
  if (household.pastOnce?.includes(chore.id)) return false;
  return Object.keys(household.completions || {}).some((key) => {
    return key.startsWith(day + ":" + chore.id + ":") && Number(household.completions[key]) > 0;
  });
}

function kindRank(chore) {
  if (isOnce(chore)) return 2;
  if (isWeekly(chore)) return 1;
  if (isEvery(chore)) return 1;
  return 0;
}

function boardRank(household, chore, kidId) {
  const done = isDone(household, chore, kidId);
  const counted = isCounted(chore);
  const extra = counted && done && countFor(household, chore, kidId) < maxCount(chore);
  const bucket = !done ? 0 : extra ? 1 : 2;
  return [bucket, chore.gold ? 0 : 1, kindRank(chore), (chore.title || "").toLowerCase()];
}

export function choresForKid(household, kidId) {
  return household.chores
    .filter((c) => c.kidIds.includes(kidId) && appliesToday(household, c))
    .slice()
    .sort((a, b) => {
      const ra = boardRank(household, a, kidId);
      const rb = boardRank(household, b, kidId);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] < rb[i]) return -1;
        if (ra[i] > rb[i]) return 1;
      }
      return 0;
    });
}

export function dailyChores(household) {
  return household.chores.filter((c) => isDaily(c));
}

export function weeklyChores(household) {
  return household.chores.filter((c) => isWeekly(c));
}

export function oneOffChores(household) {
  return household.chores.filter((c) => isOnce(c) && appliesToday(household, c));
}
