import { todayKey, datesInWeek } from "./dates.js";
import { countRec } from "./history.js";

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

export function countFor(household, chore, kidId, date = new Date()) {
  const rec = (household.counts || {})[ck(chore.id, kidId, todayKey(date))];
  return rec ? countRec(rec).n : 0;
}

export function isDone(household, chore, kidId, date = new Date()) {
  if (isCounted(chore)) return countFor(household, chore, kidId, date) >= minCount(chore);
  if (isOnce(chore)) {
    const suffix = ":" + chore.id + ":" + kidId;
    return Object.keys(household.completions).some((key) => {
      return key.includes(suffix) && Number(household.completions[key]) > 0;
    });
  }
  if (isWeekly(chore)) {
    return datesInWeek(date).some((day) => Number(household.completions[ck(chore.id, kidId, day)] || 0) > 0);
  }
  return Number(household.completions[ck(chore.id, kidId, todayKey(date))] || 0) > 0;
}

function appliesToday(household, chore, date = new Date()) {
  if (!isOnce(chore)) return true;
  const day = todayKey(date);
  const open = (chore.kidIds || []).some((id) => !isDone(household, chore, id, date));
  if (open) return true;
  if (household.pastOnce?.includes(chore.id)) return false;
  return Object.keys(household.completions).some((key) => {
    return key.startsWith(day + ":" + chore.id + ":") && Number(household.completions[key]) > 0;
  });
}

function kindRank(chore) {
  if (isOnce(chore)) return 2;
  if (isWeekly(chore)) return 1;
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
  return household.chores.filter((c) => !isOnce(c) && !isWeekly(c));
}

export function weeklyChores(household) {
  return household.chores.filter((c) => isWeekly(c));
}

export function oneOffChores(household) {
  return household.chores.filter((c) => isOnce(c) && appliesToday(household, c));
}
