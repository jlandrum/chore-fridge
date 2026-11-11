import { alreadyRedeemed, poolComplete, poolPaidIn, redemptionKey, rewardCosts, rewardValidation, shareAmount } from '@chore-fridge/domain/rewards';
import { todayKey } from "@chore-fridge/domain/dates";
import { atom } from "nanostores";
import { commit } from "./changes.js";
import { $ui } from "./navigation.js";
import { $kids, $requireParentModeForRedemptions } from "./family.js";
import { $spent, $goldSpent, $currencySpent, $exchangeEarned, amountForKid } from "./balances.js";
import { currencyId } from "@chore-fridge/domain/currencies";
import { uid, upsert } from "@chore-fridge/domain/records";

export const $rewards = atom([]);
export const $rewardRedemptions = atom({});
export const $rewardContributions = atom({});

function adjustSpent(currency, kidId, amount) {
  if (currency === "gold") $goldSpent.set({ ...$goldSpent.get(), [kidId]: ($goldSpent.get()[kidId] || 0) + amount });
  else if (currency === "star") $spent.set({ ...$spent.get(), [kidId]: ($spent.get()[kidId] || 0) + amount });
  else {
    const bucket = { ...($currencySpent.get()[currency] || {}), [kidId]: (($currencySpent.get()[currency] || {})[kidId] || 0) + amount };
    $currencySpent.set({ ...$currencySpent.get(), [currency]: bucket });
  }
}

function addPoolShare(pool, kidId, currency, amount, multi) {
  if (!multi) {
    pool[kidId] = shareAmount(pool[kidId], currency) + amount;
    if (pool[kidId] <= 0) delete pool[kidId];
    return;
  }
  const share = typeof pool[kidId] === "number" ? { [currency]: pool[kidId] } : { ...(pool[kidId] || {}) };
  share[currency] = (share[currency] || 0) + amount;
  if (share[currency] <= 0) delete share[currency];
  if (Object.keys(share).length) pool[kidId] = share;
  else delete pool[kidId];
}

function refundShare(reward, kidId, share) {
  if (share && typeof share === "object") {
    for (const [currency, amount] of Object.entries(share)) if (amount) adjustSpent(currency, kidId, -amount);
  } else if (share) adjustSpent(currencyId(reward), kidId, -share);
}

export function saveReward(reward) {
  const existing = reward.id ? $rewards.get().find((item) => item.id === reward.id) : null;
  const pooled = "pooled" in reward ? !!reward.pooled : !!existing?.pooled;
  const next = { ...reward, id: reward.id || uid(), pooled };
  if ("costs" in reward && Array.isArray(reward.costs) && reward.costs.length) next.costs = rewardCosts({costs: reward.costs});
  else if (existing && rewardCosts(existing).length && !("cost" in reward) && !("currency" in reward) && !("gold" in reward)) next.costs = rewardCosts(existing);
  else next.costs = rewardCosts(next);
  if (!next.costs.length) return {error: "Cost must be a positive whole number"};
  next.cost = next.costs[0].amount;
  next.currency = next.costs[0].currency;
  next.gold = next.currency === "gold";
  const error = rewardValidation(next);
  if (error) return {error};
  const pool = $rewardContributions.get()[next.id] || {};
  const paidAny = Object.keys(pool).length;
  if (!next.pooled && paidAny) return {error: "Return the open payments before turning this into a single-person reward"};
  if (next.costs.some((row) => row.amount < poolPaidIn(pool, row.currency))) return {error: "Cost cannot be less than the amount already paid"};
  let completed = false;
  commit(() => {
    $rewards.set(upsert($rewards.get(), next));
    if (next.pooled && paidAny && poolComplete(next, pool)) {
      const pools = {...$rewardContributions.get()};
      delete pools[next.id];
      $rewardContributions.set(pools);
      const key = redemptionKey(next.id, "*", todayKey());
      $rewardRedemptions.set({...$rewardRedemptions.get(), [key]: ($rewardRedemptions.get()[key] || 0) + 1});
      completed = true;
    }
  }, { type:"reward.save", payload:next });
  return completed ? {completed: true} : undefined;
}

export function removeReward(id) {
  const reward = $rewards.get().find((item) => item.id === id);
  const pool = $rewardContributions.get()[id] || {};
  commit(() => {
    if (reward) for (const [kidId, share] of Object.entries(pool)) refundShare(reward, kidId, share);
    const pools = {...$rewardContributions.get()};
    delete pools[id];
    $rewardContributions.set(pools);
    $rewards.set($rewards.get().filter((item) => item.id !== id));
  }, { type:"reward.remove", payload:{id} });
}

export function contributeReward(rewardId, kidId, amount, currency) {
  const error = redemptionError();
  if (error) return {error};
  const reward = $rewards.get().find((item) => item.id === rewardId);
  if (!reward) return {error: "Missing reward"};
  if (!reward.pooled) return {error: "This reward is paid by one person"};
  const payment = Number(amount);
  if (!Number.isSafeInteger(payment) || payment < 1) return {error: "Enter a whole number"};
  const validation = rewardValidation(reward);
  if (validation) return {error: validation};
  const costs = rewardCosts(reward);
  const payCurrency = currency || (costs.length === 1 ? costs[0].currency : null);
  const row = costs.find((item) => item.currency === payCurrency);
  if (!row) return {error: "Choose a currency"};
  const day = todayKey();
  if (reward.oncePerDay && alreadyRedeemed($rewardRedemptions.get(), reward.id, "*", day)) return {error: "Already redeemed today"};
  if (!$kids.get().some((kid) => kid.id === kidId)) return {error: "Unknown kid"};
  const pool = $rewardContributions.get()[rewardId] || {};
  if (payment > row.amount - poolPaidIn(pool, payCurrency)) return {error: "That is more than the remaining cost"};
  if (amountForKid(kidId, payCurrency) < payment) return {error: "Not enough credit yet"};
  let completed = false;
  const payload = {rewardId, kidId, amount: payment, day};
  if (costs.length > 1) payload.currency = payCurrency;
  commit(() => {
    adjustSpent(payCurrency, kidId, payment);
    const pools = {...$rewardContributions.get()};
    const nextPool = {...(pools[rewardId] || {})};
    addPoolShare(nextPool, kidId, payCurrency, payment, costs.length > 1);
    if (poolComplete(reward, nextPool)) {
      delete pools[rewardId];
      const key = redemptionKey(rewardId, "*", day);
      $rewardRedemptions.set({...$rewardRedemptions.get(), [key]: ($rewardRedemptions.get()[key] || 0) + 1});
      completed = true;
    } else pools[rewardId] = nextPool;
    $rewardContributions.set(pools);
  }, { type:"reward.contribute", payload });
  return {ok: true, completed, reward};
}

export function returnContribution(rewardId, kidId, amount) {
  const error = redemptionError();
  if (error) return {error};
  const reward = $rewards.get().find((item) => item.id === rewardId);
  if (!reward) return {error: "Missing reward"};
  const share = ($rewardContributions.get()[rewardId] || {})[kidId];
  if (!share) return {error: "Nothing to return"};
  const payload = {rewardId, kidId, day: todayKey()};
  commit(() => {
    refundShare(reward, kidId, share);
    const pools = {...$rewardContributions.get()};
    const pool = {...(pools[rewardId] || {})};
    delete pool[kidId];
    if (Object.keys(pool).length) pools[rewardId] = pool;
    else delete pools[rewardId];
    $rewardContributions.set(pools);
  }, { type:"reward.return", payload });
  return {ok: true};
}

export function redeemReward(rewardId, kidId) {
  const error = redemptionError();
  if (error) return {error};
  const reward = $rewards.get().find((item) => item.id === rewardId);
  if (!reward) return { error: "Missing reward" };
  if (reward.pooled) return {error: "Family rewards are paid in parts"};
  if (!$kids.get().some(kid => kid.id === kidId)) return {error: "Unknown kid"};
  const validation = rewardValidation(reward);
  if (validation) return {error: validation};
  if (reward.oncePerDay && alreadyRedeemed($rewardRedemptions.get(), reward.id, kidId, todayKey())) return {error: "Already redeemed today"};
  const costs = rewardCosts(reward);
  if (costs.some((row) => amountForKid(kidId, row.currency) < row.amount)) return { error: "Not enough credit yet" };
  commit(() => {
    for (const row of costs) adjustSpent(row.currency, kidId, row.amount);
    if (reward.currencyExchange) {
      const earned = $exchangeEarned.get();
      const bucket = earned[reward.exchangeCurrency] || {};
      $exchangeEarned.set({...earned, [reward.exchangeCurrency]: {...bucket, [kidId]: (bucket[kidId] || 0) + reward.exchangeValue}});
    }
    const key = redemptionKey(rewardId, kidId, todayKey());
    $rewardRedemptions.set({...$rewardRedemptions.get(), [key]: ($rewardRedemptions.get()[key] || 0) + 1});
  }, { type:"reward.redeem", payload:{rewardId,kidId,day:todayKey()} });
  return { ok: true, reward, kid: $kids.get().find((kid) => kid.id === kidId) || null };
}

export function redemptionError() {
  return $requireParentModeForRedemptions.get() && !$ui.get().parentUnlocked
    ? "Unlock Parent Mode to redeem rewards." : null;
}
