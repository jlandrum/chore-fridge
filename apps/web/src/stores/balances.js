import { balancesFor } from "@chore-fridge/domain/balances";
import { atom, computed } from "nanostores";
import { $kids } from "./family.js";
import { $chores, $completions, $counts } from "./chores.js";

export const $balanceCarry = atom(null);
export const $creditProjection = atom(null);
export const $spent = atom({});
export const $goldSpent = atom({});

export const $balances = computed([$kids, $chores, $completions, $counts, $spent, $goldSpent, $creditProjection, $balanceCarry], (kids, chores, completions, counts, spent, goldSpent, creditProjection, balanceCarry) => {
  return balancesFor({ kids, chores, completions, counts, spent, goldSpent, creditProjection, balanceCarry });
});

export function starsFor(kidId) { return $balances.get()[kidId]?.stars || 0; }
export function goldFor(kidId) { return $balances.get()[kidId]?.gold || 0; }
export function familyStars() { return Object.values($balances.get()).reduce((sum, value) => sum + value.stars, 0); }
export function familyGold() { return Object.values($balances.get()).reduce((sum, value) => sum + value.gold, 0); }

