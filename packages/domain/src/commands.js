import { initializeTaskHistory, evolveTaskHistory } from './task-history.js';
import { validDay } from './day-view.js';
import { defaultState } from './state.js';
import { ck, isOnce, isWeekly, isCounted, maxCount, countFor } from './chores.js';
import { datesInWeek } from './dates.js';
import { balancesFor } from './balances.js';
import { upsert } from './records.js';

function requireValue(condition, message) {
  if (!condition) throw Object.assign(new Error(message), { statusCode:409 });
}

// Pure application service: HTTP and future MCP adapters use these same rules.
export function applyCommand(current, command, now = Date.now()) {
  const previous = initializeTaskHistory(current || defaultState(),now);
  let state = structuredClone(previous);
  const p = command.payload;
  if (p.day) requireValue(validDay(p.day),'Invalid task date');
  let result = { ok:true };
  switch (command.type) {
    case 'kid.save':
      requireValue(p.name.trim(), 'Kid needs a name');
      state.kids = upsert(state.kids, {emoji:'🐻',color:'#e85d4c',...p,name:p.name.trim()});
      break;
    case 'kid.remove': state.kids = state.kids.filter(kid => kid.id !== p.id); break;
    case 'chore.save': {
      requireValue(!state.archivedChores.some(task => task.id === p.id), 'Restore the archived task before editing');
      requireValue(p.title.trim(), 'Task needs a name');
      requireValue(p.kidIds.every(id => state.kids.some(kid => kid.id === id)), 'Unknown assigned kid');
      requireValue((p.maxCount || 1) >= (p.minCount || 1), 'Maximum count must cover minimum count');
      state.chores = upsert(state.chores, {emoji:'🔁',points:0,repeat:'daily',minCount:1,maxCount:1,gold:false,...p,title:p.title.trim()});
      break;
    }
    case 'chore.remove': state.chores = state.chores.filter(chore => chore.id !== p.id); break;
    case 'chore.restore': {
      const task = state.archivedChores.find(task => task.id === p.id);
      requireValue(task, 'Unknown archived task');
      state.chores.push(task);
      break;
    }
    case 'reward.save':
      requireValue(p.title.trim(), 'Reward needs a name');
      state.rewards = upsert(state.rewards, {emoji:'🎁',gold:false,...p,title:p.title.trim()});
      break;
    case 'reward.remove': state.rewards = state.rewards.filter(reward => reward.id !== p.id); break;
    case 'settings.update': state.requireParentModeForCompletion = p.requireParentModeForCompletion; break;
    case 'pin.set': state.pin = p.pin; break;
    case 'setup.finish':
      requireValue(!state.setupDone, 'Household is already set up');
      requireValue(new Set(p.kids.map(kid => kid.id)).size === p.kids.length, 'Duplicate kid IDs');
      state.familyName = p.familyName;
      state.kids = p.kids.map(kid => ({emoji:'🐻',color:'#e85d4c',...kid}));
      state.pin = p.pin;
      state.setupDone = true;
      break;
    case 'household.reset': state = defaultState(); break;
    case 'reward.redeem': {
      const reward = state.rewards.find(item => item.id === p.rewardId);
      requireValue(reward, 'Missing reward');
      const balance = balancesFor(state)[p.kidId];
      requireValue(balance, 'Unknown kid');
      requireValue((reward.gold ? balance.gold : balance.stars) >= reward.cost, 'Not enough credit');
      const spent = reward.gold ? state.goldSpent : state.spent;
      spent[p.kidId] = (spent[p.kidId] || 0) + reward.cost;
      result.reward = reward;
      break;
    }
    case 'chore.complete': case 'chore.undo': case 'chore.count': {
      const active = state.chores.find(item => item.id === p.choreId);
      const chore = p.versionId ? state.taskVersions.find(item => item.id === p.choreId && item.versionId === p.versionId && !item.archived) : active;
      requireValue(active, 'Task is archived or missing');
      requireValue(chore && state.kids.some(kid => kid.id === p.kidId), 'Unknown task or kid');
      requireValue(chore.kidIds.includes(p.kidId), 'Task is not assigned to this kid');
      const date = new Date(p.day + 'T12:00:00');
      requireValue(Number.isFinite(date.getTime()) && date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0') === p.day, 'Invalid task date');
      const key = ck(chore.id, p.kidId, p.day);
      if (command.type === 'chore.count') {
        requireValue(isCounted(chore), 'Task does not use a count');
        const n = Math.max(0, Math.min(maxCount(chore), countFor(state, chore, p.kidId, date) + p.delta));
        state.counts[key] = {n,t:Math.max(now,(state.counts[key]?.t || 0)+1)};
        result.count = n;
      } else {
        requireValue(!isCounted(chore), 'Use the count command for this task');
        const keys = isOnce(chore)
          ? Object.keys(state.completions).filter(item => item.endsWith(':' + chore.id + ':' + p.kidId))
          : isWeekly(chore) ? datesInWeek(date).map(day => ck(chore.id,p.kidId,day)) : [key];
        const completed = keys.filter(item => state.completions[item] > 0);
        if (command.type === 'chore.complete' && !completed.length) state.completions[key] = Math.max(now,Math.abs(state.completions[key] || 0)+1);
        if (command.type === 'chore.undo') for (const item of completed) state.completions[item] = -Math.max(now,Math.abs(state.completions[item])+1);
      }
      break;
    }
    default: throw Object.assign(new Error('Unknown command'), {statusCode:400});
  }
  state.updatedAt = Math.max(now, (current?.updatedAt || 0) + 1);
  state = command.type === "household.reset"
    ? initializeTaskHistory(state,state.updatedAt)
    : evolveTaskHistory(previous,state,command,state.updatedAt);
  return { state, result };
}
