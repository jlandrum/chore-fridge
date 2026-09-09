import { alreadyRedeemed, redemptionKey, rewardValidation } from '@chore-fridge/domain/rewards';
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

export function saveReward(reward) {
  const error = rewardValidation(reward);
  if (error) return {error};
  const currency = currencyId(reward);
  const next = { ...reward, id: reward.id || uid(), currency, gold: currency === "gold" };
  commit(() => $rewards.set(upsert($rewards.get(), next)), { type:"reward.save", payload:next });
}

export function removeReward(id) {
  commit(() => $rewards.set($rewards.get().filter((reward) => reward.id !== id)), { type:"reward.remove", payload:{id} });
}

export function redeemReward(rewardId, kidId) {
  const error = redemptionError();
  if (error) return {error};
  const reward = $rewards.get().find((item) => item.id === rewardId);
  if (!reward) return { error: "Missing reward" };
  const currency = currencyId(reward);
  if (!$kids.get().some(kid => kid.id === kidId)) return {error: "Unknown kid"};
  const validation = rewardValidation(reward);
  if (validation) return {error: validation};
  if (reward.oncePerDay && alreadyRedeemed($rewardRedemptions.get(), reward.id, kidId, todayKey())) return {error: "Already redeemed today"};
  const available = amountForKid(kidId, currency);
  if (available < reward.cost) return { error: "Not enough credit yet" };
  commit(() => {
    if (currency === "gold") $goldSpent.set({ ...$goldSpent.get(), [kidId]: ($goldSpent.get()[kidId] || 0) + reward.cost });
    else if (currency === "star") $spent.set({ ...$spent.get(), [kidId]: ($spent.get()[kidId] || 0) + reward.cost });
    else {
      const bucket = { ...($currencySpent.get()[currency] || {}), [kidId]: (($currencySpent.get()[currency] || {})[kidId] || 0) + reward.cost };
      $currencySpent.set({ ...$currencySpent.get(), [currency]: bucket });
    }
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
