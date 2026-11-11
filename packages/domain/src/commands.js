import { alreadyRedeemed, poolComplete, poolPaidIn, redemptionKey, rewardCosts, rewardValidation, shareAmount } from './rewards.js';
import { todayKey } from './dates.js';
import { initializeTaskHistory, evolveTaskHistory } from './task-history.js';
import { validDay } from './day-view.js';
import { defaultState } from './state.js';
import { ck, isOnce, isWeekly, isCounted, maxCount, countFor, isDueOn, claimedBy, allAssignedDone, normalizeChore } from './chores.js';
import { datesInWeek } from './dates.js';
import { amountFor, balancesFor } from './balances.js';
import { currencyId, normalizeCurrencies, addSpent } from './currencies.js';
import { upsert } from './records.js';

function requireValue(condition, message) {
  if (!condition) throw Object.assign(new Error(message), { statusCode:409 });
}

function refundPool(state, reward) {
  const pool = state.rewardContributions?.[reward.id] || {};
  const fallback = currencyId(reward);
  for (const [kidId, share] of Object.entries(pool)) {
    if (share && typeof share === 'object') {
      for (const [currency, amount] of Object.entries(share)) if (amount) addSpent(state, currency, kidId, -amount);
    } else if (share) addSpent(state, fallback, kidId, -share);
  }
  if (state.rewardContributions) delete state.rewardContributions[reward.id];
}

function addPoolShare(pool, kidId, currency, amount, multi) {
  if (!multi) {
    pool[kidId] = shareAmount(pool[kidId], currency) + amount;
    if (pool[kidId] <= 0) delete pool[kidId];
    return;
  }
  const share = typeof pool[kidId] === 'number' ? { [currency]: pool[kidId] } : { ...(pool[kidId] || {}) };
  share[currency] = (share[currency] || 0) + amount;
  if (share[currency] <= 0) delete share[currency];
  if (Object.keys(share).length) pool[kidId] = share;
  else delete pool[kidId];
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
      state.chores = upsert(state.chores, normalizeChore(p, new Date(now)));
      break;
    }
    case 'chore.remove': state.chores = state.chores.filter(chore => chore.id !== p.id); break;
    case 'chore.restore': {
      const task = state.archivedChores.find(task => task.id === p.id);
      requireValue(task, 'Unknown archived task');
      state.chores.push(task);
      break;
    }
    case 'reward.save': {
      requireValue(p.title.trim(), 'Reward needs a name');
      const existing = state.rewards.find(reward => reward.id === p.id);
      const pooled = 'pooled' in p ? !!p.pooled : !!existing?.pooled;
      const next = {emoji:'🎁',...p,title:p.title.trim(),pooled};
      if ('costs' in p && Array.isArray(p.costs) && p.costs.length) next.costs = rewardCosts({costs:p.costs});
      else if (existing && rewardCosts(existing).length && !('cost' in p) && !('currency' in p) && !('gold' in p)) next.costs = rewardCosts(existing);
      else next.costs = rewardCosts(next);
      requireValue(next.costs.length, 'Cost must be a positive whole number');
      next.cost = next.costs[0].amount;
      next.currency = next.costs[0].currency;
      next.gold = next.currency === 'gold';
      const validation = rewardValidation(next);
      requireValue(!validation, validation);
      const pool = state.rewardContributions?.[p.id] || {};
      const paidAny = Object.keys(pool).length;
      requireValue(!(!pooled && paidAny), 'Return the open payments before turning this into a single-person reward');
      for (const row of next.costs) {
        requireValue(row.amount >= poolPaidIn(pool, row.currency), 'Cost cannot be less than the amount already paid');
      }
      state.rewards = upsert(state.rewards, next);
      if (pooled && paidAny && poolComplete(next, pool)) {
        delete state.rewardContributions[p.id];
        const records = state.rewardRedemptions ||= {};
        const key = redemptionKey(p.id, '*', todayKey(new Date(now)));
        records[key] = (records[key] || 0) + 1;
        result.completed = true;
      }
      break;
    }
    case 'reward.remove': {
      const reward = state.rewards.find(item => item.id === p.id);
      if (reward) refundPool(state, reward);
      state.rewards = state.rewards.filter(item => item.id !== p.id);
      break;
    }
    case 'settings.update':
      for (const key of ['requireParentModeForCompletion','requireParentModeForRedemptions','mcpEnabled']) {
        if (key in p) state[key] = p[key];
      }
      if ('familyName' in p) {
        requireValue(p.familyName.trim(), 'Household needs a name');
        state.familyName = p.familyName.trim();
      }
      if ('sayings' in p) state.sayings = p.sayings.map(line => line.trim()).filter(Boolean);
      if ('currencies' in p) state.currencies = normalizeCurrencies(p.currencies);
      break;
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
    case 'reward.contribute': {
      const reward = state.rewards.find(item => item.id === p.rewardId);
      requireValue(reward, 'Missing reward');
      requireValue(reward.pooled, 'This reward is paid by one person');
      const validation = rewardValidation(reward);
      requireValue(!validation, validation);
      requireValue(Number.isSafeInteger(p.amount) && p.amount >= 1, 'Enter a whole number');
      const costs = rewardCosts(reward);
      const currency = p.currency || (costs.length === 1 ? costs[0].currency : null);
      requireValue(currency && costs.some((row) => row.currency === currency), 'Choose a currency');
      const day = p.day || todayKey(new Date(now));
      if (reward.oncePerDay) {
        requireValue(day === todayKey(new Date(now)), 'Daily rewards must be redeemed for today');
        requireValue(!alreadyRedeemed(state.rewardRedemptions, reward.id, '*', day), 'Already redeemed today');
      }
      const balance = balancesFor(state)[p.kidId];
      requireValue(balance, 'Unknown kid');
      requireValue(amountFor(balance, currency) >= p.amount, 'Not enough credit');
      const pools = state.rewardContributions ||= {};
      const pool = { ...(pools[reward.id] || {}) };
      const row = costs.find((item) => item.currency === currency);
      requireValue(p.amount <= row.amount - poolPaidIn(pool, currency), 'That is more than the remaining cost');
      addSpent(state, currency, p.kidId, p.amount);
      addPoolShare(pool, p.kidId, currency, p.amount, costs.length > 1);
      if (poolComplete(reward, pool)) {
        delete pools[reward.id];
        const records = state.rewardRedemptions ||= {};
        // "*" is the household completion. A kid id cannot be "*".
        const key = redemptionKey(reward.id, '*', day);
        records[key] = (records[key] || 0) + 1;
        result.completed = true;
      } else pools[reward.id] = pool;
      result.reward = reward;
      break;
    }
    case 'reward.return': {
      const reward = state.rewards.find(item => item.id === p.rewardId);
      requireValue(reward, 'Missing reward');
      const pools = state.rewardContributions ||= {};
      const pool = { ...(pools[reward.id] || {}) };
      const share = pool[p.kidId];
      requireValue(share, 'Nothing to return');
      const costs = rewardCosts(reward);
      const multi = costs.length > 1 || (share && typeof share === 'object');
      if (p.amount == null) {
        if (share && typeof share === 'object') {
          for (const [currency, amount] of Object.entries(share)) if (amount) addSpent(state, currency, p.kidId, -amount);
        } else addSpent(state, currencyId(reward), p.kidId, -share);
        delete pool[p.kidId];
      } else {
        const currency = p.currency || (typeof share === 'number' ? currencyId(reward) : Object.keys(share)[0]);
        requireValue(currency, 'Choose a currency');
        const have = shareAmount(share, currency);
        requireValue(Number.isSafeInteger(p.amount) && p.amount >= 1 && p.amount <= have, 'That amount is not in this reward');
        addSpent(state, currency, p.kidId, -p.amount);
        addPoolShare(pool, p.kidId, currency, -p.amount, multi);
      }
      if (Object.keys(pool).length) pools[reward.id] = pool;
      else delete pools[reward.id];
      result.reward = reward;
      break;
    }
    case 'reward.redeem': {
      const reward = state.rewards.find(item => item.id === p.rewardId);
      requireValue(reward, 'Missing reward');
      requireValue(!reward.pooled, 'Family rewards are paid in parts');
      const day = p.day || todayKey(new Date(now));
      if (reward.oncePerDay) {
        requireValue(day === todayKey(new Date(now)), 'Daily rewards must be redeemed for today');
        requireValue(!alreadyRedeemed(state.rewardRedemptions, reward.id, p.kidId, day), 'Already redeemed today');
      }
      const validation = rewardValidation(reward);
      requireValue(!validation, validation);
      const balance = balancesFor(state)[p.kidId];
      requireValue(balance, 'Unknown kid');
      for (const row of rewardCosts(reward)) {
        requireValue(amountFor(balance, row.currency) >= row.amount, 'Not enough credit');
      }
      for (const row of rewardCosts(reward)) addSpent(state, row.currency, p.kidId, row.amount);
      if (reward.currencyExchange) {
        const earned = state.exchangeEarned ||= {};
        const bucket = earned[reward.exchangeCurrency] ||= {};
        bucket[p.kidId] = (bucket[p.kidId] || 0) + reward.exchangeValue;
      }
      const records = state.rewardRedemptions ||= {};
      const key = redemptionKey(reward.id, p.kidId, day);
      records[key] = (records[key] || 0) + 1;
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
      requireValue(isDueOn(chore, date), 'Task is not scheduled for this day');
      const key = ck(chore.id, p.kidId, p.day);
      const claimer = claimedBy(state, chore, date);
      if (command.type === 'chore.count') {
        requireValue(isCounted(chore), 'Task does not use a count');
        const n = Math.max(0, Math.min(maxCount(chore), countFor(state, chore, p.kidId, date) + p.delta));
        state.counts[key] = {n,t:Math.max(now,(state.counts[key]?.t || 0)+1)};
        result.count = n;
      } else {
        requireValue(!isCounted(chore), 'Use the count command for this task');
        if (isWeekly(chore) && chore.sharedClaim) {
          if (command.type === 'chore.complete') requireValue(!claimer, 'Already claimed this week');
          if (command.type === 'chore.undo') requireValue(claimer === p.kidId, 'Only the claimer can undo');
        }
        const keys = isOnce(chore)
          ? Object.keys(state.completions).filter(item => item.endsWith(':' + chore.id + ':' + p.kidId))
          : isWeekly(chore) ? datesInWeek(date).map(day => ck(chore.id,p.kidId,day)) : [key];
        const completed = keys.filter(item => state.completions[item] > 0);
        if (command.type === 'chore.complete' && !completed.length) state.completions[key] = Math.max(now,Math.abs(state.completions[key] || 0)+1);
        if (command.type === 'chore.undo') for (const item of completed) state.completions[item] = -Math.max(now,Math.abs(state.completions[item])+1);
      }
      if ((command.type === 'chore.complete' || command.type === 'chore.count') && isOnce(active) && active.archiveOnComplete !== false && allAssignedDone(state, active, date)) {
        state.chores = state.chores.filter(item => item.id !== active.id);
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
