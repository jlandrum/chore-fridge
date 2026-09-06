import { todayKey } from "@chore-fridge/domain/dates";
import { atom } from "nanostores";
import { commit } from "./changes.js";
import { $kids } from "./family.js";
import { $spent, $goldSpent, starsFor, goldFor } from "./balances.js";
import { uid, upsert } from "@chore-fridge/domain/records";

export const $rewards = atom([]);

export function saveReward(reward) {
  const next = { ...reward, id: reward.id || uid() };
  commit(() => $rewards.set(upsert($rewards.get(), next)), { type:"reward.save", payload:next });
}

export function removeReward(id) {
  commit(() => $rewards.set($rewards.get().filter((reward) => reward.id !== id)), { type:"reward.remove", payload:{id} });
}

export function redeemReward(rewardId, kidId) {
  const reward = $rewards.get().find((item) => item.id === rewardId);
  if (!reward) return { error: "Missing reward" };
  const available = reward.gold ? goldFor(kidId) : starsFor(kidId);
  if (available < reward.cost) return { error: reward.gold ? "Not enough gold stars yet" : "Not enough stars yet" };
  const spending = reward.gold ? $goldSpent : $spent;
  commit(() => spending.set({ ...spending.get(), [kidId]: (spending.get()[kidId] || 0) + reward.cost }), { type:"reward.redeem", payload:{rewardId,kidId,day:todayKey()} });
  return { ok: true, reward, kid: $kids.get().find((kid) => kid.id === kidId) || null };
}
