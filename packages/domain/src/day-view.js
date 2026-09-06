import { ck, isOnce, isWeekly, isCounted } from './chores.js';
import { datesInWeek, todayKey } from './dates.js';

export function validDay(day) {
  const date = new Date(day + 'T12:00:00');
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime()) && todayKey(date) === day;
}

// Contains today's records and compact carry-forward status for weekly/once
// tasks. Past records, task versions, archived definitions and the journal stay
// on the server. balanceCarry permits optimistic edits without all-time history.
export function dayView(state,day,totals) {
  if (!state) return null;
  const counts = Object.fromEntries(Object.entries(state.counts).filter(([key]) => key.startsWith(day+':')));
  const completions = Object.fromEntries(Object.entries(state.completions).filter(([key]) => key.startsWith(day+':')));
  const creditProjection = {};
  const pastOnce = [];
  const week = new Set(datesInWeek(new Date(day+'T12:00:00')));
  for (const task of state.chores) {
    let anyToday = false;
    for (const kid of state.kids) {
      const key = ck(task.id,kid.id,day);
      let keys = [key];
      if (!isCounted(task) && (isWeekly(task) || isOnce(task))) {
        keys = Object.keys(state.completions).filter(key => key.endsWith(':'+task.id+':'+kid.id) && state.completions[key] > 0 && (isOnce(task) ? key.slice(0,10) <= day : week.has(key.slice(0,10))));
        if (keys.length) completions[key] = 1;
      }
      if (state.completions[key] > 0) anyToday = true;
      const entries = keys.flatMap(key => state.creditProjection?.[key] || []);
      if (entries.length) creditProjection[key] = entries.map(({taskId,versionId,kidId,units,points,gold}) => ({taskId,versionId,kidId,units,points,gold}));
    }
    if (isOnce(task) && !anyToday) pastOnce.push(task.id);
  }
  const balanceCarry = Object.fromEntries(state.kids.map(kid => [kid.id,{...(totals[kid.id] || {stars:0,gold:0})}]));
  for (const entries of Object.values(creditProjection)) for (const entry of entries) {
    const total = balanceCarry[entry.kidId];
    if (total) { total.stars -= entry.units*entry.points; if (entry.gold) total.gold -= entry.units; }
  }
  return {version:1,dayScoped:true,day,updatedAt:state.updatedAt,familyName:state.familyName,pin:state.pin,setupDone:state.setupDone,
    kids:state.kids,chores:state.chores,rewards:state.rewards,completions,counts,creditProjection,balanceCarry,pastOnce,spent:{},goldSpent:{}};
}
